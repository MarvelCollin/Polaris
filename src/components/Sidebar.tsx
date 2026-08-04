import { NavLink } from "react-router-dom";
import { Separator } from "@/components/ui/separator";
import {
  LayoutDashboard,
  ShoppingCart,
  Truck,
  Package,
  FolderOpen,
  FileText,
} from "lucide-react";

const links = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/kasir", label: "Kasir", icon: ShoppingCart },
  { to: "/pembelian", label: "Pembelian", icon: Truck },
  { to: "/produk", label: "Produk", icon: Package },
  { to: "/kategori", label: "Kategori", icon: FolderOpen },
  { to: "/riwayat-jual", label: "Riwayat Penjualan", icon: FileText },
  { to: "/riwayat-beli", label: "Riwayat Pembelian", icon: FileText },
];

export default function Sidebar() {
  return (
    <aside className="flex h-screen w-56 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="p-4">
        <h1 className="text-xl font-bold text-sidebar-primary">Polaris</h1>
        <p className="text-xs text-muted-foreground">Toko Bangunan</p>
      </div>
      <Separator />
      <nav className="flex flex-1 flex-col gap-0.5 p-2">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`
            }
          >
            <link.icon className="size-4" />
            {link.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
