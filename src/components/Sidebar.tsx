import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Separator } from "@/components/ui/separator";
import { useTheme } from "@/hooks/useTheme";
import ChangePassword from "./ChangePassword";
import Logo from "@/assets/Logo.png";
import {
  LayoutDashboard,
  ShoppingCart,
  Truck,
  Package,
  FolderOpen,
  FileText,
  Users,
  Moon,
  Sun,
  Wallet,
  HardDrive,
  KeyRound,
  LogOut,
} from "lucide-react";

const links = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/kasir", label: "Kasir", icon: ShoppingCart },
  { to: "/pembelian", label: "Pembelian", icon: Truck },
  { to: "/produk", label: "Produk", icon: Package },
  { to: "/kategori", label: "Kategori", icon: FolderOpen },
  { to: "/pelanggan", label: "Pelanggan", icon: Users },
  { to: "/riwayat-jual", label: "Riwayat Penjualan", icon: FileText },
  { to: "/riwayat-beli", label: "Riwayat Pembelian", icon: FileText },
  { to: "/utang-piutang", label: "Utang & Piutang", icon: Wallet },
  { to: "/backup", label: "Backup", icon: HardDrive },
];

export default function Sidebar() {
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [showChangePw, setShowChangePw] = useState(false);

  function handleLogout() {
    sessionStorage.removeItem("polaris_auth");
    navigate("/login", { replace: true });
  }

  return (
    <aside className="flex h-screen w-56 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2.5 p-4">
        <img src={Logo} alt="Sahabat Sentarum" className="size-10" />
        <div>
          <h1 className="text-base font-bold leading-tight text-sidebar-primary">Sahabat Sentarum</h1>
          <p className="text-[10px] text-sidebar-foreground/50">Toko Bangunan</p>
        </div>
      </div>
      <Separator className="bg-sidebar-border" />
      <nav className="flex flex-1 flex-col gap-0.5 p-2">
        {links.map((link, i) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === "/"}
            style={{ animationDelay: `${i * 30}ms`, animationFillMode: "backwards" }}
            className={({ isActive }) =>
              `animate-slide-in-left flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`
            }
          >
            <link.icon className="size-4" />
            {link.label}
          </NavLink>
        ))}
      </nav>
      <Separator className="bg-sidebar-border" />
      <div className="flex flex-col gap-0.5 p-2">
        <button
          onClick={toggle}
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          {theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
          {theme === "light" ? "Mode Gelap" : "Mode Terang"}
        </button>
        <button
          onClick={() => setShowChangePw(true)}
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <KeyRound className="size-4" />
          Ubah Password
        </button>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="size-4" />
          Keluar
        </button>
      </div>
      <ChangePassword open={showChangePw} onClose={() => setShowChangePw(false)} />
    </aside>
  );
}
