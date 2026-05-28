// app/(auth)/login/page.tsx
'use client';

import { signInWithGoogle } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error("Error signing in:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="border-zinc-800 bg-zinc-900">
      <CardHeader className="text-center">
        <CardTitle className="text-3xl font-bold text-zinc-50">Welcome to Drift Tasks</CardTitle>
        <CardDescription className="text-zinc-400 mt-2">
          A gentle task manager for ADHD minds
        </CardDescription>
      </CardHeader>

      <CardContent>
        <Button 
          onClick={handleGoogleSignIn}
          disabled={isLoading}
          className="w-full h-12 text-base bg-zinc-800 hover:bg-zinc-700"
          variant="default"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Signing in...
            </>
          ) : (
            <>
              Sign in with Google
            </>
          )}
        </Button>

        {/* <p className="text-center text-xs text-zinc-500 mt-6">
          By signing in, you agree to our Terms and Privacy Policy
        </p> */}
      </CardContent>
    </Card>
  );
}