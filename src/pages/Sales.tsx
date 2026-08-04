import { useState, useCallback, useEffect } from "react";
import { useQuery } from "@/hooks/useQuery";
import { useDebounce } from "@/hooks/useDebounce";
import { getProducts } from "@/db/products";
import { createSale } from "@/db/sales";
import { getCustomers, getCustomerPriceMap } from "@/db/customers";
import { CartEntry, Customer, formatRupiah } from "@/types/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import SearchInput from "@/components/SearchInput";
import { Plus, Minus, Trash2, CheckCircle, UserCircle } from "lucide-react";
import ProductThumb from "@/components/ProductThumb";

export default function Sales() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const { data: products, refetch: refetchProducts } = useQuery(
    useCallback(() => getProducts(debouncedSearch || undefined), [debouncedSearch])
  );
  const { data: customers } = useQuery(useCallback(() => getCustomers(), []));

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [priceMap, setPriceMap] = useState<Record<number, number>>({});
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [paid, setPaid] = useState<number>(0);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (selectedCustomer) {
      getCustomerPriceMap(selectedCustomer.id).then(setPriceMap);
    } else {
      setPriceMap({});
    }
  }, [selectedCustomer]);

  useEffect(() => {
    if (Object.keys(priceMap).length > 0) {
      setCart((prev) =>
        prev.map((item) => {
          const customPrice = priceMap[item.produk_id];
          return customPrice !== undefined ? { ...item, harga: customPrice } : item;
        })
      );
    }
  }, [priceMap]);

  const total = cart.reduce((sum, item) => sum + item.jumlah * item.harga, 0);
  const change = paid - total;

  function getPrice(p: { id: number; harga_jual: number }): number {
    return priceMap[p.id] ?? p.harga_jual;
  }

  function addToCart(p: { id: number; nama: string; satuan: string; harga_jual: number; stok: number }) {
    const price = getPrice(p);
    setCart((prev) => {
      const existing = prev.find((c) => c.produk_id === p.id);
      if (existing) {
        if (existing.jumlah >= p.stok) return prev;
        return prev.map((c) => c.produk_id === p.id ? { ...c, jumlah: c.jumlah + 1 } : c);
      }
      if (p.stok <= 0) return prev;
      return [...prev, { produk_id: p.id, nama: p.nama, satuan: p.satuan, jumlah: 1, harga: price, stok: p.stok }];
    });
  }

  function updateQty(produkId: number, delta: number) {
    setCart((prev) =>
      prev.map((c) => {
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

  function handleCustomerChange(customerId: number) {
    if (customerId === 0) {
      setSelectedCustomer(null);
      setCart((prev) => {
        if (!products) return prev;
        return prev.map((item) => {
          const prod = products.find((p) => p.id === item.produk_id);
          return prod ? { ...item, harga: prod.harga_jual } : item;
        });
      });
    } else {
      const cust = customers?.find((c) => c.id === customerId) ?? null;
      setSelectedCustomer(cust);
    }
  }

  async function handleCheckout() {
    if (cart.length === 0 || paid < total) return;
    try {
      await createSale(cart, paid, selectedCustomer?.id, selectedCustomer?.nama);
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
    <div className="animate-fade-in">
      <h1 className="mb-4 text-2xl font-bold">Kasir</h1>

      {success && (
        <div className="animate-fade-in-up mb-4 flex items-center gap-2 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <CheckCircle className="size-4" /> {success}
        </div>
      )}

      <div className="grid grid-cols-5 gap-4">
        <div className="col-span-3">
          <div className="mb-3 flex items-center gap-3">
            <SearchInput value={search} onChange={setSearch} placeholder="Cari produk..." />
          </div>
          <div className="max-h-[calc(100vh-220px)] overflow-y-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="w-10 px-2 py-2"></th>
                  <th className="px-3 py-2 text-left font-medium">Kode</th>
                  <th className="px-3 py-2 text-left font-medium">Nama</th>
                  <th className="px-3 py-2 text-left font-medium">Harga</th>
                  <th className="px-3 py-2 text-left font-medium">Stok</th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody>
                {products?.map((p) => {
                  const price = getPrice(p);
                  const hasCustom = priceMap[p.id] !== undefined;
                  return (
                    <tr key={p.id} className="border-t hover:bg-muted/50">
                      <td className="px-2 py-2"><ProductThumb path={p.gambar} /></td>
                      <td className="px-3 py-2 font-mono text-xs">{p.kode}</td>
                      <td className="px-3 py-2">{p.nama}</td>
                      <td className="px-3 py-2">
                        {hasCustom ? (
                          <span className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground line-through">{formatRupiah(p.harga_jual)}</span>
                            <Badge variant="secondary" className="text-xs">{formatRupiah(price)}</Badge>
                          </span>
                        ) : (
                          formatRupiah(price)
                        )}
                      </td>
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
                  );
                })}
                {products?.length === 0 && (
                  <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Produk tidak ditemukan</td></tr>
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
              <div className="mb-3">
                <div className="flex items-center gap-2">
                  <UserCircle className="size-4 text-muted-foreground" />
                  <select
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    value={selectedCustomer?.id ?? 0}
                    onChange={(e) => handleCustomerChange(Number(e.target.value))}
                  >
                    <option value={0}>Umum (tanpa pelanggan)</option>
                    {customers?.map((c) => (
                      <option key={c.id} value={c.id}>{c.nama}</option>
                    ))}
                  </select>
                </div>
                {selectedCustomer && Object.keys(priceMap).length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {Object.keys(priceMap).length} harga khusus aktif
                  </p>
                )}
              </div>

              <Separator className="mb-3" />

              {cart.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Keranjang kosong</p>
              ) : (
                <div className="max-h-[calc(100vh-520px)] space-y-2 overflow-y-auto">
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
