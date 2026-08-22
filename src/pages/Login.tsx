import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { verifyPassword } from "@/db/auth";
import { useTheme } from "@/hooks/useTheme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { closeApp } from "@/lib/app";
import { Lock, Eye, EyeOff, Moon, Sun, Power } from "lucide-react";
import Logo from "@/assets/Logo.png";

export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!password.trim()) return;

    setLoading(true);
    setError("");

    const valid = await verifyPassword(password);
    if (valid) {
      sessionStorage.setItem("polaris_auth", "1");
      navigate("/", { replace: true });
    } else {
      setError("Password salah");
      setPassword("");
    }
    setLoading(false);
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <button
        onClick={toggle}
        className="absolute top-4 right-4 rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        {theme === "light" ? <Moon className="size-5" /> : <Sun className="size-5" />}
      </button>

      <div className="w-full max-w-sm animate-fade-in-up">
        <div className="mb-8 flex flex-col items-center gap-3">
          <img src={Logo} alt="Sahabat Sentarum" className="size-20" />
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">Sahabat Sentarum</h1>
            <p className="text-sm text-muted-foreground">Toko Bangunan</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Lock className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="Masukkan password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-9 pr-10"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>

          {error && (
            <p className="text-center text-sm text-destructive">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Memverifikasi..." : "Masuk"}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => closeApp()}
          >
            <Power className="mr-2 size-4" />
            Tutup Aplikasi
          </Button>
        </form>
      </div>
    </div>
  );
}
