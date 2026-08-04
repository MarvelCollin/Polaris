import { useState, useCallback } from "react";
import { useQuery } from "@/hooks/useQuery";
import { useDebounce } from "@/hooks/useDebounce";
import { getProducts } from "@/db/products";
import { createSale } from "@/db/sales";
import { CartEntry, formatRupiah } from "@/types/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import SearchInput from "@/components/SearchInput";
import { Plus, Minus, Trash2, CheckCircle } from "lucide-react";

export default function Sales() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const { data: products, refetch: refetchProducts } = useQuery(
    useCallback(() => getProducts(debouncedSearch || undefined), [debouncedSearch])
  );

  const [cart, setCart] = useState<CartEntry[]>([]);
  const [paid, setPaid] = useState<number>(0);
  const [success, setSuccess] = useState<string | null>(null);

  const total = cart.reduce((sum, item) => sum + item.jumlah * item.harga, 0);
  const change = paid - total;

  function addToCart(p: { id: number; nama: string; satuan: string; harga_jual: number; stok: number }) {
    setCart((prev) => {
      const existing = prev.find((c) => c.produk_id === p.id);
      if (existing) {
        if (existing.jumlah >= p.stok) return prev;
        return prev.map((c) => c.produk_id === p.id ? { ...c, jumlah: c.jumlah + 1 } : c);
      }
      if (p.stok <= 0) return prev;
      return [...prev, { produk_id: p.id, nama: p.nama, satuan: p.satuan, jumlah: 1, harga: p.harga_jual, stok: p.stok }];
    });
  }

  function updateQty(produkId: number, delta: number) {
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.produk_id !== produkId) return c;
          const newQty = c.jumlah + delta;
          if (newQty > c.stok || newQty < 1) return c;
          return { ...c, jumlah: newQty };
        })
    );
  }

  function removeFromCart(produkId: number) {
    setCart((prev) => prev.filter((c) => c.produk_id !== produkId));
  }

  async function handleCheckout() {
    if (cart.length === 0 || paid < total) return;
    try {
      await createSale(cart, paid);
      setSuccess(`Pembayaran berhasil! Kembalian: ${formatRupiah(change)}`);
      setCart([]);
      setPaid(0);
      refetchProducts();
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Kasir</h1>

      {success && (
        <div className="mb-4 flex items-center gap-2 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <CheckCircle className="size-4" /> {success}
        </div>
      )}

      <div className="grid grid-cols-5 gap-4">
        <div className="col-span-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Cari produk..." />
          <div className="mt-3 max-h-[calc(100vh-220px)] overflow-y-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Kode</th>
                  <th className="px-3 py-2 text-left font-medium">Nama</th>
                  <th className="px-3 py-2 text-left font-medium">Harga</th>
                  <th className="px-3 py-2 text-left font-medium">Stok</th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody>
                {products?.map((p) => (
                  <tr key={p.id} className="border-t hover:bg-muted/50">
                    <td className="px-3 py-2 font-mono text-xs">{p.kode}</td>
                    <td className="px-3 py-2">{p.nama}</td>
                    <td className="px-3 py-2">{formatRupiah(p.harga_jual)}</td>
                    <td className="px-3 py-2">{p.stok} {p.satuan}</td>
                    <td className="px-3 py-2">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        disabled={p.stok <= 0}
                        onClick={() => addToCart(p)}
                      >
                        <Plus className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {products?.length === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Produk tidak ditemukan</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Keranjang</CardTitle>
            </CardHeader>
            <CardContent>
              {cart.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Keranjang kosong</p>
              ) : (
                <div className="max-h-[calc(100vh-440px)] space-y-2 overflow-y-auto">
                  {cart.map((item) => (
                    <div key={item.produk_id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                      <div className="flex-1">
                        <p className="font-medium">{item.nama}</p>
                        <p className="text-xs text-muted-foreground">{formatRupiah(item.harga)} / {item.satuan}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="icon-xs" onClick={() => updateQty(item.produk_id, -1)}>
                          <Minus className="size-3" />
                        </Button>
                        <span className="w-8 text-center text-sm">{item.jumlah}</span>
                        <Button variant="outline" size="icon-xs" onClick={() => updateQty(item.produk_id, 1)}>
                          <Plus className="size-3" />
                        </Button>
                      </div>
                      <span className="w-24 text-right text-sm font-medium">{formatRupiah(item.jumlah * item.harga)}</span>
                      <Button variant="ghost" size="icon-xs" onClick={() => removeFromCart(item.produk_id)}>
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <Separator className="my-3" />

              <div className="space-y-2">
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span>{formatRupiah(total)}</span>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Bayar</label>
                  <Input
                    type="number"
                    value={paid || ""}
                    onChange={(e) => setPaid(Number(e.target.value))}
                    className="mt-1"
                  />
                </div>
                {paid > 0 && paid >= total && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Kembalian</span>
                    <span className="font-medium text-emerald-600">{formatRupiah(change)}</span>
                  </div>
                )}
                <Button
                  className="mt-2 w-full"
                  disabled={cart.length === 0 || paid < total}
                  onClick={handleCheckout}
                >
                  Selesai
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
