import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@/hooks/useQuery";
import { useDebounce } from "@/hooks/useDebounce";
import { getProducts } from "@/db/products";
import { getCategories } from "@/db/categories";
import { createPurchase, getDistinctSuppliers } from "@/db/purchases";
import { PurchaseEntry, ProductWithCategory, formatRupiah } from "@/types/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import SearchInput from "@/components/SearchInput";
import { Plus, Minus, Trash2, CheckCircle } from "lucide-react";
import ProductThumb from "@/components/ProductThumb";

export default function Purchases() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [selectedCat, setSelectedCat] = useState(0);

  const { data: allProducts, refetch: refetchProducts } = useQuery(
    useCallback(() => getProducts(), [])
  );
  const { data: categories } = useQuery(useCallback(() => getCategories(), []));
  const { data: existingSuppliers } = useQuery(
    useCallback(() => getDistinctSuppliers(), [])
  );

  const [supplier, setSupplier] = useState("");
  const [supplierOpen, setSupplierOpen] = useState(false);
  const supplierRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<PurchaseEntry[]>([]);
  const [isUtang, setIsUtang] = useState(false);
  const [dibayar, setDibayar] = useState<number>(0);
  const [success, setSuccess] = useState<string | null>(null);

  const filteredSuppliers = (existingSuppliers ?? []).filter(
    (s) => supplier.length > 0 && s.toLowerCase().includes(supplier.toLowerCase()) && s !== supplier
  );

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (supplierRef.current && !supplierRef.current.contains(e.target as Node)) {
        setSupplierOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

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

  const total = items.reduce((sum, item) => sum + item.jumlah * item.harga, 0);

  function addItem(p: { id: number; nama: string; satuan: string; harga_beli: number }) {
    setItems((prev) => {
      const existing = prev.find((c) => c.produk_id === p.id);
      if (existing) {
        return prev.map((c) => c.produk_id === p.id ? { ...c, jumlah: c.jumlah + 1 } : c);
      }
      return [...prev, { produk_id: p.id, nama: p.nama, satuan: p.satuan, jumlah: 1, harga: p.harga_beli }];
    });
  }

  function updateQty(produkId: number, delta: number) {
    setItems((prev) =>
      prev.map((c) => {
        if (c.produk_id !== produkId) return c;
        const newQty = c.jumlah + delta;
        if (newQty < 1) return c;
        return { ...c, jumlah: newQty };
      })
    );
  }

  function updatePrice(produkId: number, harga: number) {
    setItems((prev) =>
      prev.map((c) => c.produk_id === produkId ? { ...c, harga } : c)
    );
  }

  function removeItem(produkId: number) {
    setItems((prev) => prev.filter((c) => c.produk_id !== produkId));
  }

  function isInCart(produkId: number): number {
    return items.find((c) => c.produk_id === produkId)?.jumlah ?? 0;
  }

  async function handleSave() {
    if (!supplier.trim() || items.length === 0) return;
    try {
      const paidAmount = isUtang ? dibayar : total;
      const trimmed = supplier.trim();
      const matched = (existingSuppliers ?? []).find(
        (s) => s.toLowerCase() === trimmed.toLowerCase()
      );
      await createPurchase(matched ?? trimmed, items, paidAmount);
      const sisaUtang = total - paidAmount;
      if (isUtang && sisaUtang > 0) {
        setSuccess(`Pembelian disimpan! Utang: ${formatRupiah(sisaUtang)}`);
      } else {
        setSuccess("Pembelian berhasil disimpan!");
      }
      setSupplier("");
      setItems([]);
      setIsUtang(false);
      setDibayar(0);
      refetchProducts();
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  function ProductTile({ p }: { p: ProductWithCategory }) {
    const qty = isInCart(p.id);

    return (
      <button
        type="button"
        onClick={() => addItem(p)}
        className={`relative flex flex-col rounded-lg border p-3 text-left transition-all cursor-pointer hover:border-primary hover:shadow-sm active:scale-[0.98] ${
          qty > 0 ? "border-primary bg-primary/5" : ""
        }`}
      >
        {qty > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {qty}
          </span>
        )}
        <div className="mb-1 flex items-start gap-2">
          <ProductThumb path={p.gambar} size="h-12 w-12" />
          <div className="min-w-0 flex-1">
            <span className="text-sm font-medium leading-tight">{p.nama}</span>
            <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">{p.kode}</span>
          </div>
        </div>
        <div className="mt-auto pt-2">
          <span className="text-sm font-semibold text-primary">{formatRupiah(p.harga_beli)}</span>
          <span className={`block text-[10px] ${p.stok <= p.stok_minimum ? "text-destructive" : "text-muted-foreground"}`}>
            Stok: {p.stok} {p.satuan}
          </span>
        </div>
      </button>
    );
  }

  return (
    <div className="animate-fade-in">
      <h1 className="mb-4 text-2xl font-bold">Pembelian</h1>

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

          <div className="max-h-[calc(100vh-260px)] overflow-y-auto rounded-md p-1">
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
              <CardTitle className="text-base">Keranjang Pembelian</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-3" ref={supplierRef}>
                <div className="relative">
                  <Input
                    value={supplier}
                    onChange={(e) => { setSupplier(e.target.value); setSupplierOpen(true); }}
                    onFocus={() => setSupplierOpen(true)}
                    placeholder="Ketik atau pilih supplier"
                    autoComplete="off"
                  />
                  {supplierOpen && filteredSuppliers.length > 0 && (
                    <div className="absolute z-50 mt-1 max-h-40 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
                      {filteredSuppliers.map((s) => (
                        <button
                          key={s}
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                          onClick={() => { setSupplier(s); setSupplierOpen(false); }}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <Separator className="mb-3" />

              {items.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Keranjang kosong</p>
              ) : (
                <div className="max-h-[calc(100vh-520px)] space-y-2 overflow-y-auto">
                  {items.map((item) => (
                    <div key={item.produk_id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                      <div className="flex-1">
                        <p className="font-medium">{item.nama}</p>
                        <Input
                          type="number"
                          value={item.harga || ""}
                          onChange={(e) => updatePrice(item.produk_id, Number(e.target.value))}
                          className="mt-1 h-7 w-28 text-xs"
                        />
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
                      <Button variant="ghost" size="icon-xs" onClick={() => removeItem(item.produk_id)}>
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
                </div>

                {isUtang && (
                  <>
                    <div>
                      <label className="text-sm text-muted-foreground">Bayar di muka</label>
                      <Input
                        type="number"
                        value={dibayar || ""}
                        onChange={(e) => setDibayar(Number(e.target.value))}
                        className="mt-1"
                      />
                    </div>
                    {total > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Sisa Utang</span>
                        <span className="font-medium text-destructive">{formatRupiah(Math.max(0, total - dibayar))}</span>
                      </div>
                    )}
                  </>
                )}

                <Button
                  className="mt-2 w-full"
                  disabled={!supplier.trim() || items.length === 0}
                  onClick={handleSave}
                >
                  {isUtang ? "Simpan (Utang)" : "Simpan Pembelian"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
