import { memo, useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useToast } from "@/components/Toast";
import { useQuery } from "@/hooks/useQuery";
import { useDebounce } from "@/hooks/useDebounce";
import { useIncrementalRender } from "@/hooks/useIncrementalRender";
import { getProducts, getFrequentProductIds } from "@/db/products";
import { getCategories } from "@/db/categories";
import { createSale } from "@/db/sales";
import { getCustomers, getCustomerPriceMap, getCustomerAddresses } from "@/db/customers";
import { CartEntry, Customer, CustomerAddress, ProductWithCategory, formatRupiah } from "@/types/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import SearchInput from "@/components/SearchInput";
import { Plus, Minus, Trash2, UserCircle, Star, Percent, QrCode, Loader2, X, MapPin, CheckCircle } from "lucide-react";
import ProductThumb from "@/components/ProductThumb";
import SearchableSelect from "@/components/SearchableSelect";
import Modal from "@/components/Modal";
import { createQrisCharge, checkTransactionStatus, cancelTransaction, getQrisImageUrl, isSettled, isPending, QrisResponse } from "@/lib/midtrans";

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
      className={`relative flex flex-col overflow-hidden rounded-lg border bg-card p-2.5 text-left transition-[border-color,box-shadow,transform] duration-150 ${
        outOfStock
          ? "cursor-not-allowed opacity-50"
          : "cursor-pointer hover:border-primary hover:shadow-sm active:scale-[0.98]"
      } ${qty > 0 ? "border-primary bg-primary/5" : ""}`}
    >
      {qty > 0 && (
        <span className="absolute right-1 top-1 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
          {qty}
        </span>
      )}
      <div className="mb-2 flex w-full items-center justify-center">
        <ProductThumb path={p.gambar} size="h-20 w-full max-w-[6rem]" />
      </div>
      <p className="line-clamp-2 text-sm font-medium leading-tight">{p.nama}</p>
      <span className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{p.kode}</span>
      <div className="mt-auto pt-1.5">
        {hasCustom ? (
          <>
            <span className="block text-[10px] text-muted-foreground line-through">{formatRupiah(p.harga_jual)}</span>
            <span className="block text-sm font-semibold text-primary">{formatRupiah(price)}</span>
          </>
        ) : (
          <span className="block text-sm font-semibold text-primary">{formatRupiah(price)}</span>
        )}
        <span className={`block text-[10px] ${p.stok <= p.stok_minimum ? "text-destructive" : "text-muted-foreground"}`}>
          {p.stok} {p.satuan}
        </span>
      </div>
    </button>
  );
});

export default function Sales() {
  const toast = useToast();
  const busyRef = useRef(false);
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
  const [customerAddresses, setCustomerAddresses] = useState<CustomerAddress[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [priceMap, setPriceMap] = useState<Record<number, number>>({});
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [paid, setPaid] = useState<number>(0);
  const [isUtang, setIsUtang] = useState(false);
  const [discountType, setDiscountType] = useState<"percent" | "rupiah">("percent");
  const [discountValue, setDiscountValue] = useState<number>(0);

  const [qrisOpen, setQrisOpen] = useState(false);
  const [qrisLoading, setQrisLoading] = useState(false);
  const [qrisResponse, setQrisResponse] = useState<QrisResponse | null>(null);
  const [qrisStatus, setQrisStatus] = useState<"idle" | "pending" | "settled" | "error">("idle");
  const [qrisError, setQrisError] = useState<string | null>(null);
  const qrisPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (selectedCustomer) {
      getCustomerPriceMap(selectedCustomer.id).then(setPriceMap);
      getCustomerAddresses(selectedCustomer.id).then((addrs) => {
        setCustomerAddresses(addrs);
        if (selectedCustomer.alamat) {
          setSelectedAddress(selectedCustomer.alamat);
        } else if (addrs.length > 0) {
          setSelectedAddress(addrs[0].alamat);
        } else {
          setSelectedAddress(null);
        }
      });
    } else {
      setPriceMap({});
      setCustomerAddresses([]);
      setSelectedAddress(null);
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

  const priceMapRef = useRef(priceMap);
  priceMapRef.current = priceMap;

  const addToCart = useCallback((p: { id: number; nama: string; satuan: string; harga_jual: number; stok: number }) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.produk_id === p.id);
      if (existing) {
        if (existing.jumlah >= p.stok) return prev;
        return prev.map((c) => c.produk_id === p.id ? { ...c, jumlah: c.jumlah + 1 } : c);
      }
      if (p.stok <= 0) return prev;
      const price = priceMapRef.current[p.id] ?? p.harga_jual;
      return [...prev, { produk_id: p.id, nama: p.nama, satuan: p.satuan, jumlah: 1, harga: price, stok: p.stok }];
    });
  }, []);

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
      setCustomerAddresses([]);
      setSelectedAddress(null);
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

  function stopQrisPolling() {
    if (qrisPollingRef.current) {
      clearInterval(qrisPollingRef.current);
      qrisPollingRef.current = null;
    }
  }

  async function handleQrisPayment() {
    if (cart.length === 0 || total <= 0) return;
    setQrisLoading(true);
    setQrisError(null);
    setQrisStatus("idle");
    try {
      const orderId = `POS-${Date.now()}`;
      const response = await createQrisCharge(orderId, total);
      setQrisResponse(response);
      setQrisStatus("pending");
      setQrisOpen(true);

      const interval = setInterval(async () => {
        try {
          const status = await checkTransactionStatus(response.order_id);
          if (isSettled(status)) {
            clearInterval(interval);
            qrisPollingRef.current = null;
            setQrisStatus("settled");
            const qSnap = { cart: [...cart], total, customerId: selectedCustomer?.id, customerName: selectedCustomer?.nama, discountAmount, selectedAddress };
            setQrisOpen(false);
            setCart([]);
            setPaid(0);
            setIsUtang(false);
            setDiscountValue(0);
            setQrisResponse(null);
            setQrisStatus("idle");
            toast.success("Pembayaran QRIS berhasil!");
            createSale(qSnap.cart, qSnap.total, qSnap.customerId, qSnap.customerName, qSnap.discountAmount, qSnap.selectedAddress)
              .then(() => refetchProducts())
              .catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
          } else if (!isPending(status)) {
            clearInterval(interval);
            qrisPollingRef.current = null;
            setQrisStatus("error");
            setQrisError(`Transaksi ${status.transaction_status}`);
          }
        } catch {
          // keep polling
        }
      }, 3000);
      qrisPollingRef.current = interval;
    } catch (e) {
      setQrisError(e instanceof Error ? e.message : String(e));
      setQrisStatus("error");
    } finally {
      setQrisLoading(false);
    }
  }

  async function handleCancelQris() {
    stopQrisPolling();
    if (qrisResponse) {
      try {
        await cancelTransaction(qrisResponse.order_id);
      } catch {
        // ignore cancel errors
      }
    }
    setQrisOpen(false);
    setQrisResponse(null);
    setQrisStatus("idle");
    setQrisError(null);
  }

  useEffect(() => {
    return () => {
      if (qrisPollingRef.current) clearInterval(qrisPollingRef.current);
    };
  }, []);

  const canCheckout = cart.length > 0 && (isUtang ? selectedCustomer !== null : paid >= total);
  const sisaUtang = isUtang ? total - paid : 0;

  function handleCheckout() {
    if (!canCheckout || busyRef.current) return;
    if (isUtang && !selectedCustomer) return;
    busyRef.current = true;

    const snap = { cart, paid, discountAmount, selectedAddress, customerId: selectedCustomer?.id, customerName: selectedCustomer?.nama };
    const msg = isUtang ? `Penjualan utang berhasil! Sisa: ${formatRupiah(sisaUtang)}` : `Pembayaran berhasil! Kembalian: ${formatRupiah(change)}`;

    setCart([]);
    setPaid(0);
    setIsUtang(false);
    setDiscountValue(0);
    toast.success(msg);

    createSale(snap.cart, snap.paid, snap.customerId, snap.customerName, snap.discountAmount, snap.selectedAddress)
      .then(() => refetchProducts())
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)))
      .finally(() => { busyRef.current = false; });
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

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="min-w-0 flex-1 flex-col">
          <div className="mb-3">
            <SearchInput value={search} onChange={setSearch} placeholder="Cari produk..." />
          </div>

          {!debouncedSearch && !selectedCat && frequentProducts.length > 0 && (
            <div className="mb-4">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Star className="size-3" /> Sering Dibeli
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2 p-1">
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

          <div className="max-h-[calc(100vh-22rem)] overflow-y-auto rounded-md p-1">
            {visibleProducts.length > 0 ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
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

        <div className="w-full shrink-0 lg:w-[380px]">
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
                {selectedCustomer && (
                  <div className="mt-2">
                    <div className="flex items-center gap-2">
                      <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
                      <select
                        className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                        value={selectedAddress ?? ""}
                        onChange={(e) => setSelectedAddress(e.target.value || null)}
                      >
                        <option value="">Tanpa Alamat</option>
                        {selectedCustomer.alamat && (
                          <option value={selectedCustomer.alamat}>Alamat Utama: {selectedCustomer.alamat}</option>
                        )}
                        {customerAddresses.map((a) => (
                          <option key={a.id} value={a.alamat}>{a.label}: {a.alamat}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
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
                <div className="max-h-[calc(100vh-35rem)] space-y-2 overflow-y-auto">
                  {cart.map((item) => (
                    <div key={item.produk_id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{item.nama}</p>
                        <p className="text-xs text-muted-foreground">{formatRupiah(item.harga)} / {item.satuan}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button variant="outline" size="icon-xs" onClick={() => updateQty(item.produk_id, -1)}>
                          <Minus className="size-3" />
                        </Button>
                        <span className="w-8 text-center text-sm">{item.jumlah}</span>
                        <Button variant="outline" size="icon-xs" onClick={() => updateQty(item.produk_id, 1)}>
                          <Plus className="size-3" />
                        </Button>
                      </div>
                      <span className="shrink-0 text-right text-sm font-medium">{formatRupiah(item.jumlah * item.harga)}</span>
                      <Button variant="ghost" size="icon-xs" className="shrink-0" onClick={() => removeFromCart(item.produk_id)}>
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

                <div className="mt-2 flex gap-2">
                  <Button
                    className="flex-1"
                    disabled={!canCheckout}
                    onClick={handleCheckout}
                  >
                    {isUtang ? "Simpan (Utang)" : "Selesai"}
                  </Button>
                  {!isUtang && (
                    <Button
                      variant="outline"
                      className="gap-1.5"
                      disabled={cart.length === 0 || total <= 0 || qrisLoading}
                      onClick={handleQrisPayment}
                    >
                      {qrisLoading ? <Loader2 className="size-4 animate-spin" /> : <QrCode className="size-4" />}
                      QRIS
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Modal open={qrisOpen} onClose={handleCancelQris} title="Pembayaran QRIS">
        <div className="flex flex-col items-center gap-4 py-4">
          {qrisResponse && getQrisImageUrl(qrisResponse) && (
            <img
              src={getQrisImageUrl(qrisResponse)!}
              alt="QRIS"
              className="h-64 w-64 rounded-lg border"
            />
          )}
          <p className="text-lg font-bold">{formatRupiah(total)}</p>
          {qrisStatus === "pending" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Menunggu pembayaran...
            </div>
          )}
          {qrisStatus === "settled" && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle className="size-4" />
              Pembayaran berhasil!
            </div>
          )}
          {qrisStatus === "error" && (
            <p className="text-sm text-destructive">{qrisError}</p>
          )}
          <Button variant="outline" onClick={handleCancelQris} className="gap-1.5">
            <X className="size-4" />
            Batalkan
          </Button>
        </div>
      </Modal>
    </div>
  );
}
