// app/(auth)/layout.tsx
export default function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-950">
            <div className="w-full max-w-md px-6">
                {children}
            </div>
        </div>
    );
}