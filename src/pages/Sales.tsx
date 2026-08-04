import { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery } from "@/hooks/useQuery";
import { useDebounce } from "@/hooks/useDebounce";
import { getProducts, getFrequentProductIds } from "@/db/products";
import { getCategories } from "@/db/categories";
import { createSale } from "@/db/sales";
import { getCustomers, getCustomerPriceMap } from "@/db/customers";
import { CartEntry, Customer, ProductWithCategory, formatRupiah } from "@/types/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import SearchInput from "@/components/SearchInput";
import { Plus, Minus, Trash2, CheckCircle, UserCircle, Star } from "lucide-react";
import ProductThumb from "@/components/ProductThumb";
import SearchableSelect from "@/components/SearchableSelect";

export default function Sales() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [selectedCat, setSelectedCat] = useState(0);

  const { data: allProducts, refetch: refetchProducts } = useQuery(
    useCallback(() => getProducts(), [])
  );
  const { data: categories } = useQuery(useCallback(() => getCategories(), []));
  const { data: customers } = useQuery(useCallback(() => getCustomers(), []));
  const { data: frequentIds } = useQuery(useCallback(() => getFrequentProductIds(8), []));

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

  const filteredProducts = useMemo(() => {
    if (!allProducts) return [];
    let list = allProducts;
    if (selectedCat) {
      list = list.filter((p) => p.kategori_id === selectedCat);
    }
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter((p) => p.nama.toLowerCase().includes(q) || p.kode.toLowerCase().includes(q));
    }
    return list;
  }, [allProducts, selectedCat, debouncedSearch]);

  const frequentProducts = useMemo(() => {
    if (!allProducts || !frequentIds || frequentIds.length === 0) return [];
    return frequentIds
      .map((id) => allProducts.find((p) => p.id === id))
      .filter((p): p is ProductWithCategory => p !== undefined);
  }, [allProducts, frequentIds]);

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
        if (!allProducts) return prev;
        return prev.map((item) => {
          const prod = allProducts.find((p) => p.id === item.produk_id);
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

  function isInCart(produkId: number): number {
    return cart.find((c) => c.produk_id === produkId)?.jumlah ?? 0;
  }

  function ProductTile({ p }: { p: ProductWithCategory }) {
    const price = getPrice(p);
    const hasCustom = priceMap[p.id] !== undefined;
    const qty = isInCart(p.id);
    const outOfStock = p.stok <= 0;

    return (
      <button
        type="button"
        disabled={outOfStock}
        onClick={() => addToCart(p)}
        className={`relative flex flex-col rounded-lg border p-3 text-left transition-all ${
          outOfStock
            ? "cursor-not-allowed opacity-50"
            : "cursor-pointer hover:border-primary hover:shadow-sm active:scale-[0.98]"
        } ${qty > 0 ? "border-primary bg-primary/5" : ""}`}
      >
        {qty > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {qty}
          </span>
        )}
        <div className="mb-1 flex items-start gap-2">
          <ProductThumb path={p.gambar} size="h-8 w-8" />
          <div className="min-w-0 flex-1">
            <span className="text-sm font-medium leading-tight">{p.nama}</span>
            <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">{p.kode}</span>
          </div>
        </div>
        <div className="mt-auto pt-2">
          {hasCustom ? (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground line-through">{formatRupiah(p.harga_jual)}</span>
              <Badge variant="secondary" className="text-[10px]">{formatRupiah(price)}</Badge>
            </div>
          ) : (
            <span className="text-sm font-semibold text-primary">{formatRupiah(price)}</span>
          )}
          <span className={`block text-[10px] ${p.stok <= p.stok_minimum ? "text-destructive" : "text-muted-foreground"}`}>
            {p.stok} {p.satuan}
          </span>
        </div>
      </button>
    );
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
        <div className="col-span-3 flex flex-col">
          <div className="mb-3">
            <SearchInput value={search} onChange={setSearch} placeholder="Cari produk..." />
          </div>

          {!debouncedSearch && !selectedCat && frequentProducts.length > 0 && (
            <div className="mb-4">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Star className="size-3" /> Sering Dibeli
              </div>
              <div className="grid grid-cols-4 gap-2">
                {frequentProducts.map((p) => (
                  <ProductTile key={p.id} p={p} />
                ))}
              </div>
            </div>
          )}

          <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setSelectedCat(0)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                selectedCat === 0
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-accent"
              }`}
            >
              Semua
            </button>
            {categories?.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCat(c.id)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  selectedCat === c.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-accent"
                }`}
              >
                {c.nama}
              </button>
            ))}
          </div>

          <div className="max-h-[calc(100vh-320px)] overflow-y-auto rounded-md">
            {filteredProducts.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {filteredProducts.map((p) => (
                  <ProductTile key={p.id} p={p} />
                ))}
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">Produk tidak ditemukan</p>
            )}
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
                  <UserCircle className="size-4 shrink-0 text-muted-foreground" />
                  <SearchableSelect
                    options={customers?.map((c) => ({ value: c.id, label: c.nama })) ?? []}
                    value={selectedCustomer?.id ?? 0}
                    onChange={handleCustomerChange}
                    placeholder="Cari pelanggan..."
                    emptyLabel="Umum (tanpa pelanggan)"
                  />
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
