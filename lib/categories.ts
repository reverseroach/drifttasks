// lib/categories.ts

import { db } from './firebase';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    query,
    where,
    updateDoc,
    serverTimestamp,
    writeBatch,
    deleteField,
    orderBy,
    documentId
} from 'firebase/firestore';
import type { Category } from '@/types';
import type { Task } from '@/types';

const categoriesCollection = collection(db, 'categories');
const tasksCollection = collection(db, 'tasks')

// create a category
async function createCategory(
    userId: string, 
    categoryData: Omit<Category, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
): Promise<Category> {
    try {
        const categoryRef = await addDoc(categoriesCollection, {
            ...categoryData,
            userId: userId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });

        return {
            id: categoryRef.id,
            ...categoryData,
            userId,
            createdAt: new Date(),
            updatedAt: new Date(),
        } as Category

    } catch (error) {
        console.error("Error creating category:", error);
        throw error;
    }
}

// get a single category by id
async function getCategoryById(categoryId: string): Promise<Category | null> {
    try {
        const docRef = doc(db, 'categories', categoryId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            
            return {
                id: docSnap.id,
                ...data,
                createdAt: data.createdAt.toDate() ?? null,
                updatedAt: data.updatedAt.toDate() ?? null,
            } as Category
            
        } else {
            console.log("Document does not exist")
            return null;
        }

    } catch (error) {
        console.error("Error fetching category by ID:", error);
        throw error;
    }
}

// update a category
async function updateCategory(userId: string, categoryId: string, updates: Partial<Category>): Promise<void> {
    try {
        const docRef = doc(db, 'categories', categoryId);
        const docSnap = await getDoc(docRef);

        if(!docSnap.exists()) {
            throw new Error("Category not found")
        }

        if(docSnap.data().userId !== userId) {
            throw new Error("Unauthorized to access this category");
        }

        await updateDoc(docRef, {
            ...updates,
            updatedAt: serverTimestamp()
        });

    } catch(error) {
        console.error("Error updating category:", error);
        throw error;
    }
}

// delete a category and the categoryId in all tasks that have it
async function deleteCategory(userId: string, categoryId: string): Promise<void> {
    try {
        // grab category
        const categoryDocRef = doc(db, 'categories', categoryId);
        const categoryDocSnap = await getDoc(categoryDocRef);

        if(!categoryDocSnap.exists()) {
            throw new Error("Category not found")
        }

        if(categoryDocSnap.data().userId !== userId) {
            throw new Error("Unauthorized to delete this category");
        }

        // grab all tasks that have category
        const taskQuery = query(
            tasksCollection,
            where("userId", "==", userId),
            where("categoryId", "==", categoryId),
        )
        const taskSnapshot = await getDocs(taskQuery)

        const batch = writeBatch(db);

        if (!taskSnapshot.empty) {
            const taskIds = taskSnapshot.docs.map(doc => doc.id)

            // delete category field for each task
            for (const id of taskIds) {
                batch.update(doc(db, "tasks", id), {
                    categoryId: deleteField(),
                    updatedAt: serverTimestamp()
                })
            }
        }

        // delete category
        const categoryRef = doc(db, "categories", categoryId)
        batch.delete(categoryRef)

        await batch.commit()

    } catch(error) {
        console.error("Error deleting category:", error);
        throw error;
    }
}

// grab all tasks in a category
async function getCategoryTasks(userId: string, categoryId: string): Promise<Task[]> {
    try {
        const q = query(
            tasksCollection,
            where("userId", "==", userId),
            where("categoryId", "==", categoryId)
        );
        
        const querySnapshot = await getDocs(q);

        const tasks: Task[] = querySnapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: data.createdAt.toDate() ?? null,
                updatedAt: data.updatedAt.toDate() ?? null,
            } as Task;
        });

        return tasks;

    } catch(error) {
        console.error("Error grabbing tasks in category:", error)
        throw error
    }
}

// get all categories for a user
async function getUserCategories(userId: string): Promise<Category[]> {
    try {
        // Get all categories that relate to the user
        const q = query(
            categoriesCollection,
            where("userId", "==", userId),
            orderBy("sortOrder")
        );

        const querySnapshot = await getDocs(q);

        const categories: Category[] = querySnapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: data.createdAt.toDate() ?? null,
                updatedAt: data.updatedAt.toDate() ?? null,
            } as Category;
        })

        return categories;

    } catch(error) {
        console.error("Error fetching user categories:", error);
        throw error;
    }
}

// reorder categories function
async function reorderCategories(userId: string, orderedCategoryIds: string[]): Promise<void> {
    try{
        const categoryQuery = query(
            categoriesCollection,
            where(documentId(), "in", orderedCategoryIds),
            where("userId", "==", userId)
        )
        const categorySnapshot = await getDocs(categoryQuery)

        if(categorySnapshot.size !== new Set(orderedCategoryIds).size) {
            throw new Error("Unauthorized to order categories")
        }

        const batch = writeBatch(db);
        for (var index in orderedCategoryIds) {
            batch.update(doc(db, "categories", orderedCategoryIds[index]), {
                sortOrder: parseInt(index),
                updatedAt: serverTimestamp()
            })
        }
        
        await batch.commit()

    } catch(error) {
        console.error("Error reordering categories:", error);
        throw error;
    }
}

// =============================================
// Service Object
// =============================================

export const categoryService = {
    createCategory,
    getCategoryById,
    updateCategory,
    deleteCategory,
    getCategoryTasks,
    getUserCategories,
    reorderCategories
};