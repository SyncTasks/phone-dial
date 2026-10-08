import { LoginForm } from "./LoginForm";

export const metadata = { title: "ログイン | 久保田タスクボード" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="login">
      <LoginForm next={next ?? "/"} />
    </main>
  );
}
