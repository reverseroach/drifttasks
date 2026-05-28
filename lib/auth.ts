// lib/auth.ts
import { GoogleAuthProvider, signInWithPopup, signOut as firebaseSignOut, User } from "firebase/auth";
import { auth } from "./firebase";

const googleProvider = new GoogleAuthProvider();

// Optional: You can add scopes for Google Calendar & Tasks here
googleProvider.addScope("https://www.googleapis.com/auth/calendar");
googleProvider.addScope("https://www.googleapis.com/auth/tasks");

// Main Google Sign In Function
export const signInWithGoogle = async (): Promise<User> => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    console.log("✅ Signed in successfully:", result.user.email);
    return result.user;
  } catch (error: any) {
    console.error("❌ Google Sign In Error:", error.message);
    throw error;
  }
};

// Sign Out Function
export const signOutUser = async () => {
  try {
    await firebaseSignOut(auth);
    console.log("✅ Signed out successfully");
  } catch (error: any) {
    console.error("❌ Sign Out Error:", error.message);
    throw error;
  }
};

// Get Current User (useful for protected routes)
export const getCurrentUser = () => {
  return auth.currentUser;
};