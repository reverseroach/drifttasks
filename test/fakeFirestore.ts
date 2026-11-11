// test/fakeFirestore.ts
//
// A small in-memory stand-in for the parts of `firebase/firestore` that lib/ uses.
// Tests swap the real module for this one with:
//
//     vi.mock('firebase/firestore', () => import('../test/fakeFirestore'))
//     vi.mock('./firebase', () => ({ db: {}, auth: {} }))
//
// Then they seed documents with `seed()`, call the real service functions, and
// assert on what ended up in the store with `getStored()` / `listStored()`.
//
// It follows real Firestore rules where they matter for the app's logic:
//  - a `where` or `orderBy` on a field drops documents that don't have that field
//  - `in` accepts at most 30 values
//  - writeBatch writes nothing until commit()

type Data = Record<string, unknown>;

interface CollectionRef { kind: 'collection'; path: string }
interface DocRef { kind: 'doc'; collection: string; id: string; path: string }
interface Where { kind: 'where'; field: string; op: string; value: unknown }
interface OrderBy { kind: 'orderBy'; field: string; direction: 'asc' | 'desc' }
interface Limit { kind: 'limit'; count: number }
type Constraint = Where | OrderBy | Limit;
interface Query { kind: 'query'; collection: string; constraints: Constraint[] }

const DOCUMENT_ID = '__name__';
const store = new Map<string, Map<string, Data>>();
let autoId = 0;

// ==================== Test helpers ==================== //

/** A stand-in for a Firestore Timestamp: anything with toDate(). */
export class FakeTimestamp {
    constructor(private readonly date: Date) {}
    toDate(): Date { return this.date; }
}

export function ts(date: Date | string): FakeTimestamp {
    return new FakeTimestamp(typeof date === 'string' ? new Date(date) : date);
}

/** Clears every collection and resets generated ids. Call in beforeEach. */
export function resetStore(): void {
    store.clear();
    autoId = 0;
}

/** Puts a document straight into the store, bypassing the service layer. */
export function seed(collectionName: string, id: string, data: Data): void {
    bucket(collectionName).set(id, { ...data });
}

export function getStored(collectionName: string, id: string): Data | undefined {
    return store.get(collectionName)?.get(id);
}

export function listStored(collectionName: string): Array<Data & { id: string }> {
    return [...(store.get(collectionName)?.entries() ?? [])].map(([id, data]) => ({ id, ...data }));
}

// ==================== Sentinels ==================== //

const SERVER_TIMESTAMP = Symbol('serverTimestamp');
const DELETE_FIELD = Symbol('deleteField');
class Increment { constructor(readonly by: number) {} }

export function serverTimestamp() { return SERVER_TIMESTAMP; }
export function deleteField() { return DELETE_FIELD; }
export function increment(by: number) { return new Increment(by); }
export function documentId() { return DOCUMENT_ID; }

// ==================== References and queries ==================== //

export function collection(_db: unknown, path: string): CollectionRef {
    return { kind: 'collection', path };
}

export function doc(parent: unknown, ...segments: string[]): DocRef {
    let collectionName: string;
    let id: string | undefined;
    if (parent && (parent as CollectionRef).kind === 'collection') {
        collectionName = (parent as CollectionRef).path;
        id = segments[0];
    } else {
        [collectionName, id] = segments;
    }
    id = id ?? `auto-${++autoId}`;
    return { kind: 'doc', collection: collectionName, id, path: `${collectionName}/${id}` };
}

export function where(field: string, op: string, value: unknown): Where {
    if ((op === 'in' || op === 'not-in') && Array.isArray(value) && value.length > 30) {
        throw new Error(`Invalid Query. '${op}' filters support a maximum of 30 elements in the value array.`);
    }
    if ((op === 'in' || op === 'not-in') && Array.isArray(value) && value.length === 0) {
        throw new Error(`Invalid Query. A non-empty array is required for '${op}' filters.`);
    }
    return { kind: 'where', field, op, value };
}

export function orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): OrderBy {
    return { kind: 'orderBy', field, direction };
}

export function limit(count: number): Limit {
    return { kind: 'limit', count };
}

export function query(ref: CollectionRef, ...constraints: Constraint[]): Query {
    return { kind: 'query', collection: ref.path, constraints };
}

// ==================== Reads ==================== //

function snapshot(collectionName: string, id: string) {
    const data = store.get(collectionName)?.get(id);
    return {
        id,
        ref: doc({}, collectionName, id),
        exists: () => data !== undefined,
        data: () => (data === undefined ? undefined : { ...data }) as Data,
    };
}

export async function getDoc(ref: DocRef) {
    return snapshot(ref.collection, ref.id);
}

export async function getDocs(q: Query | CollectionRef) {
    const constraints = q.kind === 'query' ? q.constraints : [];
    const collectionName = q.kind === 'query' ? q.collection : q.path;

    let rows = [...bucket(collectionName).entries()].map(([id, data]) => ({ id, data }));

    for (const c of constraints) {
        if (c.kind === 'where') {
            rows = rows.filter(row => matches(row, c));
        }
    }

    const orders = constraints.filter((c): c is OrderBy => c.kind === 'orderBy');
    for (const o of orders) {
        rows = rows.filter(row => fieldOf(row, o.field) !== undefined);
    }
    rows.sort((a, b) => {
        for (const o of orders) {
            const cmp = compare(fieldOf(a, o.field), fieldOf(b, o.field));
            if (cmp !== 0) return o.direction === 'desc' ? -cmp : cmp;
        }
        return 0;
    });

    const lim = constraints.find((c): c is Limit => c.kind === 'limit');
    if (lim) rows = rows.slice(0, lim.count);

    const docs = rows.map(row => snapshot(collectionName, row.id));
    return { docs, empty: docs.length === 0, size: docs.length };
}

function fieldOf(row: { id: string; data: Data }, field: string): unknown {
    return field === DOCUMENT_ID ? row.id : row.data[field];
}

function matches(row: { id: string; data: Data }, w: Where): boolean {
    const actual = fieldOf(row, w.field);
    if (actual === undefined) return false;
    switch (w.op) {
        case '==': return actual === w.value;
        case '!=': return actual !== w.value;
        case '<': return compare(actual, w.value) < 0;
        case '<=': return compare(actual, w.value) <= 0;
        case '>': return compare(actual, w.value) > 0;
        case '>=': return compare(actual, w.value) >= 0;
        case 'in': return (w.value as unknown[]).includes(actual);
        case 'not-in': return !(w.value as unknown[]).includes(actual);
        default: throw new Error(`fakeFirestore: unsupported operator ${w.op}`);
    }
}

function compare(a: unknown, b: unknown): number {
    const av = a instanceof FakeTimestamp ? a.toDate().getTime() : a;
    const bv = b instanceof FakeTimestamp ? b.toDate().getTime() : b;
    if (av === bv) return 0;
    return (av as number | string) < (bv as number | string) ? -1 : 1;
}

// ==================== Writes ==================== //

function bucket(collectionName: string): Map<string, Data> {
    let b = store.get(collectionName);
    if (!b) {
        b = new Map();
        store.set(collectionName, b);
    }
    return b;
}

function resolve(value: unknown, previous: unknown): unknown {
    if (value === SERVER_TIMESTAMP) return new FakeTimestamp(new Date());
    if (value instanceof Increment) return ((previous as number) ?? 0) + value.by;
    return value;
}

function applySet(ref: DocRef, data: Data): void {
    const next: Data = {};
    for (const [key, value] of Object.entries(data)) {
        if (value === DELETE_FIELD) continue;
        next[key] = resolve(value, undefined);
    }
    bucket(ref.collection).set(ref.id, next);
}

function applyUpdate(ref: DocRef, data: Data): void {
    const existing = bucket(ref.collection).get(ref.id);
    if (!existing) {
        throw new Error(`fakeFirestore: No document to update: ${ref.path}`);
    }
    const next = { ...existing };
    for (const [key, value] of Object.entries(data)) {
        if (value === DELETE_FIELD) delete next[key];
        else next[key] = resolve(value, existing[key]);
    }
    bucket(ref.collection).set(ref.id, next);
}

export async function setDoc(ref: DocRef, data: Data): Promise<void> {
    applySet(ref, data);
}

export async function addDoc(ref: CollectionRef, data: Data): Promise<DocRef> {
    const newRef = doc(ref);
    applySet(newRef, data);
    return newRef;
}

export async function updateDoc(ref: DocRef, data: Data): Promise<void> {
    applyUpdate(ref, data);
}

export function writeBatch(_db: unknown) {
    const ops: Array<() => void> = [];
    return {
        set(ref: DocRef, data: Data) { ops.push(() => applySet(ref, data)); },
        update(ref: DocRef, data: Data) {
            ops.push(() => applyUpdate(ref, data));
        },
        delete(ref: DocRef) { ops.push(() => { bucket(ref.collection).delete(ref.id); }); },
        async commit() { ops.forEach(op => op()); },
    };
}

export async function runTransaction<T>(
    _db: unknown,
    fn: (transaction: {
        get: (ref: DocRef) => Promise<ReturnType<typeof snapshot>>;
        update: (ref: DocRef, data: Data) => void;
        set: (ref: DocRef, data: Data) => void;
    }) => Promise<T>
): Promise<T> {
    const ops: Array<() => void> = [];
    const result = await fn({
        get: async (ref) => snapshot(ref.collection, ref.id),
        update: (ref, data) => { ops.push(() => applyUpdate(ref, data)); },
        set: (ref, data) => { ops.push(() => applySet(ref, data)); },
    });
    ops.forEach(op => op());
    return result;
}
