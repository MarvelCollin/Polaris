import { memo, useState, useCallback, useEffect, useMemo } from "react";
import { useQuery } from "@/hooks/useQuery";
import { useDebounce } from "@/hooks/useDebounce";
import { useIncrementalRender } from "@/hooks/useIncrementalRender";
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
import { Plus, Minus, Trash2, CheckCircle, UserCircle, Star, Percent } from "lucide-react";
import ProductThumb from "@/components/ProductThumb";
import SearchableSelect from "@/components/SearchableSelect";

const SaleProductTile = memo(function SaleProductTile({
  p, price, hasCustom, qty, onAdd,
}: {
  p: ProductWithCategory;
  price: number;
  hasCustom: boolean;
  qty: number;
  onAdd: (p: ProductWithCategory) => void;
}) {
  const outOfStock = p.stok <= 0;

  return (
    <button
      type="button"
      disabled={outOfStock}
      onClick={() => onAdd(p)}
      className={`relative flex items-center gap-3 rounded-lg border p-3 text-left transition-[border-color,box-shadow,transform] duration-150 ${
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
      <ProductThumb path={p.gambar} size="h-16 w-16" />
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium leading-tight">{p.nama}</span>
        <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">{p.kode}</span>
        <div className="mt-1">
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
      </div>
    </button>
  );
});

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
  const [isUtang, setIsUtang] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [discountType, setDiscountType] = useState<"percent" | "rupiah">("percent");
  const [discountValue, setDiscountValue] = useState<number>(0);

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

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.jumlah * item.harga, 0), [cart]);
  const discountAmount = useMemo(() => discountType === "percent"
    ? Math.round(subtotal * Math.min(discountValue, 100) / 100)
    : Math.min(discountValue, subtotal), [discountType, discountValue, subtotal]);
  const total = subtotal - discountAmount;
  const change = paid - total;

  const addToCart = useCallback((p: { id: number; nama: string; satuan: string; harga_jual: number; stok: number }) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.produk_id === p.id);
      if (existing) {
        if (existing.jumlah >= p.stok) return prev;
        return prev.map((c) => c.produk_id === p.id ? { ...c, jumlah: c.jumlah + 1 } : c);
      }
      if (p.stok <= 0) return prev;
      const price = priceMap[p.id] ?? p.harga_jual;
      return [...prev, { produk_id: p.id, nama: p.nama, satuan: p.satuan, jumlah: 1, harga: price, stok: p.stok }];
    });
  }, [priceMap]);

  const updateQty = useCallback((produkId: number, delta: number) => {
    setCart((prev) =>
      prev.map((c) => {
        if (c.produk_id !== produkId) return c;
        const newQty = c.jumlah + delta;
        if (newQty > c.stok || newQty < 1) return c;
        return { ...c, jumlah: newQty };
      })
    );
  }, []);

  const removeFromCart = useCallback((produkId: number) => {
    setCart((prev) => prev.filter((c) => c.produk_id !== produkId));
  }, []);

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

  const canCheckout = cart.length > 0 && (isUtang ? selectedCustomer !== null : paid >= total);
  const sisaUtang = isUtang ? total - paid : 0;

  async function handleCheckout() {
    if (!canCheckout) return;
    if (isUtang && !selectedCustomer) return;
    try {
      await createSale(cart, paid, selectedCustomer?.id, selectedCustomer?.nama, discountAmount);
      if (isUtang) {
        setSuccess(`Penjualan utang berhasil! Sisa: ${formatRupiah(sisaUtang)}`);
      } else {
        setSuccess(`Pembayaran berhasil! Kembalian: ${formatRupiah(change)}`);
      }
      setCart([]);
      setPaid(0);
      setIsUtang(false);
      setDiscountValue(0);
      refetchProducts();
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  const { visible: visibleProducts, Sentinel } = useIncrementalRender(filteredProducts, 48);

  const cartQtyMap = useMemo(() => {
    const map: Record<number, number> = {};
    for (const c of cart) map[c.produk_id] = c.jumlah;
    return map;
  }, [cart]);

  return (
    <div className="animate-fade-in">
      <h1 className="mb-4 text-2xl font-bold">Kasir</h1>

      {success && (
        <div className="animate-fade-in-up mb-4 flex items-center gap-2 rounded-md bg-[#1b508a]/10 p-3 text-sm text-[#1b508a] dark:bg-[#1b508a]/20 dark:text-[#5ba0d0]">
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
              <div className="grid grid-cols-4 gap-2 p-1">
                {frequentProducts.map((p) => (
                  <SaleProductTile
                    key={p.id}
                    p={p}
                    price={priceMap[p.id] ?? p.harga_jual}
                    hasCustom={priceMap[p.id] !== undefined}
                    qty={cartQtyMap[p.id] ?? 0}
                    onAdd={addToCart}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="mb-3 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedCat(0)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
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
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  selectedCat === c.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-accent"
                }`}
              >
                {c.nama}
              </button>
            ))}
          </div>

          <div className="max-h-[calc(100vh-320px)] overflow-y-auto rounded-md p-1">
            {visibleProducts.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {visibleProducts.map((p) => (
                  <SaleProductTile
                    key={p.id}
                    p={p}
                    price={priceMap[p.id] ?? p.harga_jual}
                    hasCustom={priceMap[p.id] !== undefined}
                    qty={cartQtyMap[p.id] ?? 0}
                    onAdd={addToCart}
                  />
                ))}
                <Sentinel />
              </div>
            ) : filteredProducts.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">Produk tidak ditemukan</p>
            ) : null}
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
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{formatRupiah(subtotal)}</span>
                </div>

                <div>
                  <div className="mb-1 flex items-center gap-1.5">
                    <span className="text-sm text-muted-foreground">Diskon</span>
                    <div className="ml-auto flex overflow-hidden rounded-md border">
                      <button
                        type="button"
                        onClick={() => setDiscountType("percent")}
                        className={`flex items-center gap-1 px-2 py-0.5 text-xs font-medium transition-colors ${
                          discountType === "percent"
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        <Percent className="size-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDiscountType("rupiah")}
                        className={`flex items-center gap-1 px-2 py-0.5 text-xs font-medium transition-colors ${
                          discountType === "rupiah"
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        Rp
                      </button>
                    </div>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={discountType === "percent" ? 100 : subtotal}
                    value={discountValue || ""}
                    onChange={(e) => setDiscountValue(Number(e.target.value))}
                    placeholder={discountType === "percent" ? "0%" : "Rp 0"}
                  />
                  {discountAmount > 0 && (
                    <p className="mt-1 text-right text-xs text-destructive">
                      −{formatRupiah(discountAmount)}
                    </p>
                  )}
                </div>

                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span>{formatRupiah(total)}</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsUtang(!isUtang)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      isUtang ? "bg-primary" : "bg-muted"
                    }`}
                  >
                    <span className={`pointer-events-none inline-block size-4 rounded-full bg-white shadow-sm transition-transform ${
                      isUtang ? "translate-x-4" : "translate-x-0"
                    }`} />
                  </button>
                  <span className="text-sm text-muted-foreground">Utang</span>
                  {isUtang && !selectedCustomer && (
                    <span className="text-xs text-destructive">← Pilih pelanggan dulu</span>
                  )}
                </div>

                <div>
                  <label className="text-sm text-muted-foreground">{isUtang ? "Bayar di muka" : "Bayar"}</label>
                  <Input
                    type="number"
                    value={paid || ""}
                    onChange={(e) => setPaid(Number(e.target.value))}
                    className="mt-1"
                  />
                </div>

                {!isUtang && paid > 0 && paid >= total && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Kembalian</span>
                    <span className="font-medium text-[#1b508a] dark:text-[#5ba0d0]">{formatRupiah(change)}</span>
                  </div>
                )}

                {isUtang && total > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Sisa Utang</span>
                    <span className="font-medium text-destructive">{formatRupiah(Math.max(0, total - paid))}</span>
                  </div>
                )}

                <Button
                  className="mt-2 w-full"
                  disabled={!canCheckout}
                  onClick={handleCheckout}
                >
                  {isUtang ? "Simpan (Utang)" : "Selesai"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
