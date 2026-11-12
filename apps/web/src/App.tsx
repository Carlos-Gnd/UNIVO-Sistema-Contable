import { Toaster } from "@/components/ui/sonner";

export function App() {
  return (
    <div className="app-shell">
      <main>
        <h1>Sistema Contable UNIVO</h1>
      </main>
      <footer className="app-footer">v{__APP_VERSION__}</footer>
      <Toaster theme="dark" />
    </div>
  );
}
