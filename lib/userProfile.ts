// lib/userProfile.ts

import { db } from './firebase';
import {
    doc,
    setDoc,
    getDoc,
    updateDoc,
    serverTimestamp,
} from 'firebase/firestore';

import type { UserProfile } from '@/types';


export async function createUserProfile(
    uid: string,
    profileData: Omit<UserProfile, 'uid' | 'createdAt' | 'updatedAt' | 'currentStreak' | 'longestStreak'>
): Promise<UserProfile> {
    try {
        const profileRef = doc(db, 'userProfiles', uid)
        await setDoc(profileRef, {
            ...profileData,
            currentStreak: 0,
            longestStreak: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        })

        return {
            uid,
            ...profileData,
            createdAt: new Date(),
            updatedAt: new Date()
        } as UserProfile

    } catch (error) {
        console.error("Error creating user profile:", error)
        throw error
    }
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
    try {
        const docRef = doc(db, 'userProfiles', userId)
        const docSnap = await getDoc(docRef)

        if (docSnap.exists()) {
            const data = docSnap.data();
            return {
                uid: docSnap.id,
                ...data,
                createdAt: data.createdAt.toDate() ?? null,
                updatedAt: data.updatedAt.toDate() ?? null,
            } as UserProfile
        } else {
            console.log("User profile does not exist")
            return null
        }

    } catch (error) {
        console.error("Error fetching user profile:", error);
        throw error;
    }
}

export async function updateUserProfile(userId: string, updates: Partial<UserProfile>): Promise<void> {
    try {
        const docRef = doc(db, 'userProfiles', userId)
        const docSnap = await getDoc(docRef)

        if(!docSnap.exists()) {
            throw new Error("User profile not found");
        }

        await updateDoc(docRef, {
            ...updates,
            updatedAt: serverTimestamp()
        })

    } catch (error) {
        console.error("Error updating user profile:", error);
        throw error;
    }
}