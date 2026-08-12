import { NavLink, useNavigate } from "react-router-dom";
import { Separator } from "@/components/ui/separator";
import { useUpdate } from "@/hooks/useUpdate";
import Logo from "@/assets/Logo.png";
import {
  LayoutDashboard,
  ShoppingCart,
  Truck,
  Package,
  FolderOpen,
  FileText,
  Users,
  Wallet,
  HardDrive,
  LogOut,
  Settings,
  ArrowDownToLine,
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

const linkClass = (isActive: boolean) =>
  `animate-slide-in-left flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
    isActive
      ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
      : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
  }`;

export default function Sidebar() {
  const { status, version, reopen } = useUpdate();
  const navigate = useNavigate();

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
            className={({ isActive }) => linkClass(isActive)}
          >
            <link.icon className="size-4" />
            {link.label}
          </NavLink>
        ))}
      </nav>
      <Separator className="bg-sidebar-border" />
      <div className="flex flex-col gap-0.5 p-2">
        {status === "available" && (
          <button
            onClick={reopen}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-semibold text-amber-600 transition-colors hover:bg-sidebar-accent dark:text-amber-400"
          >
            <ArrowDownToLine className="size-4" />
            Update v{version}
          </button>
        )}
        <NavLink
          to="/pengaturan"
          className={({ isActive }) => linkClass(isActive)}
        >
          <Settings className="size-4" />
          Pengaturan
        </NavLink>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="size-4" />
          Keluar
        </button>
      </div>
    </aside>
  );
}
