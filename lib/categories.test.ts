import {
    expect,
    it,
    describe,
    vi,
    beforeEach,
    afterEach,
} from 'vitest'

vi.mock('firebase/firestore', () => import('../test/fakeFirestore'))
vi.mock('./firebase', () => ({ db: {}, auth: {} }))

import { categoryService } from './categories'
import { resetStore, getStored, listStored } from '../test/fakeFirestore'
import { seedTask, seedCategory } from '../test/builders'

beforeEach(() => {
    resetStore()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('createCategory', () => {
    it('saves the category under the given user', async () => {
        const category = await categoryService.createCategory('user-1', { name: 'Crafting', color: '#f00', sortOrder: 2 })
        expect(getStored('categories', category.id)).toMatchObject({ name: 'Crafting', userId: 'user-1', sortOrder: 2 })
        expect(category.userId).toBe('user-1')
    })
})

describe('getCategoryById', () => {
    it('returns null for a category that does not exist', async () => {
        expect(await categoryService.getCategoryById('missing')).toBeNull()
    })

    it('returns the category with Dates', async () => {
        seedCategory('home')
        const category = await categoryService.getCategoryById('home')
        expect(category?.id).toBe('home')
        expect(category?.createdAt).toBeInstanceOf(Date)
    })
})

describe('updateCategory', () => {
    it('updates the user\'s own category', async () => {
        seedCategory('home')
        await categoryService.updateCategory('user-1', 'home', { name: 'House' })
        expect(getStored('categories', 'home')!.name).toBe('House')
    })

    it('refuses to update another user\'s category', async () => {
        seedCategory('home', { userId: 'user-2' })
        await expect(categoryService.updateCategory('user-1', 'home', { name: 'x' })).rejects.toThrow('Unauthorized')
    })
})

describe('deleteCategory', () => {
    it('deletes the category and removes it from the user\'s tasks', async () => {
        seedCategory('home')
        seedTask('in-home', { categoryId: 'home' })
        seedTask('in-work', { categoryId: 'work' })

        await categoryService.deleteCategory('user-1', 'home')

        expect(getStored('categories', 'home')).toBeUndefined()
        expect(getStored('tasks', 'in-home')).not.toHaveProperty('categoryId')
        expect(getStored('tasks', 'in-work')!.categoryId).toBe('work')
    })

    it('works when no tasks use the category', async () => {
        seedCategory('home')
        await categoryService.deleteCategory('user-1', 'home')
        expect(listStored('categories')).toHaveLength(0)
    })

    it('refuses to delete another user\'s category', async () => {
        seedCategory('home', { userId: 'user-2' })
        await expect(categoryService.deleteCategory('user-1', 'home')).rejects.toThrow('Unauthorized')
        expect(getStored('categories', 'home')).toBeDefined()
    })

    it('throws for a category that does not exist', async () => {
        await expect(categoryService.deleteCategory('user-1', 'missing')).rejects.toThrow('Category not found')
    })
})

describe('getCategoryTasks', () => {
    it('returns the user\'s tasks in that category', async () => {
        seedTask('a', { categoryId: 'home' })
        seedTask('b', { categoryId: 'work' })
        seedTask('c', { categoryId: 'home', userId: 'user-2' })
        const tasks = await categoryService.getCategoryTasks('user-1', 'home')
        expect(tasks.map(t => t.id)).toEqual(['a'])
    })
})

describe('getUserCategories', () => {
    it('returns the user\'s categories in sortOrder', async () => {
        seedCategory('second', { sortOrder: 1 })
        seedCategory('first', { sortOrder: 0 })
        seedCategory('theirs', { userId: 'user-2', sortOrder: 0 })
        const categories = await categoryService.getUserCategories('user-1')
        expect(categories.map(c => c.id)).toEqual(['first', 'second'])
    })
})

describe('reorderCategories', () => {
    it('sets sortOrder to each category\'s position in the list', async () => {
        seedCategory('a', { sortOrder: 0 })
        seedCategory('b', { sortOrder: 1 })
        seedCategory('c', { sortOrder: 2 })

        await categoryService.reorderCategories('user-1', ['c', 'a', 'b'])

        expect(getStored('categories', 'c')!.sortOrder).toBe(0)
        expect(getStored('categories', 'a')!.sortOrder).toBe(1)
        expect(getStored('categories', 'b')!.sortOrder).toBe(2)
    })

    it('refuses the whole reorder if any category belongs to someone else', async () => {
        seedCategory('a', { sortOrder: 0 })
        seedCategory('theirs', { userId: 'user-2', sortOrder: 5 })

        await expect(categoryService.reorderCategories('user-1', ['theirs', 'a'])).rejects.toThrow('Unauthorized')

        expect(getStored('categories', 'a')!.sortOrder).toBe(0)
        expect(getStored('categories', 'theirs')!.sortOrder).toBe(5)
    })
})
