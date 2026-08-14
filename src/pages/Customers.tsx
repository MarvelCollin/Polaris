import { useState, useCallback } from "react";
import { useQuery } from "@/hooks/useQuery";
import { useDebounce } from "@/hooks/useDebounce";
import { useSort } from "@/hooks/useSort";
import { getCustomers, createCustomer, updateCustomer, deleteCustomer, getCustomerPrices, setCustomerPrice, removeCustomerPrice, getCustomerAddresses, addCustomerAddress, updateCustomerAddress, deleteCustomerAddress } from "@/db/customers";
import { getProducts } from "@/db/products";
import { Customer, CustomerAddress, CustomerPrice, formatRupiah } from "@/types/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ConfirmDialog";
import SearchInput from "@/components/SearchInput";
import SortableHead from "@/components/SortableHead";
import { Plus, Pencil, Trash2, Tag, MapPin } from "lucide-react";
import SearchableSelect from "@/components/SearchableSelect";

const emptyForm = { nama: "", telepon: "", alamat: "" };

export default function Customers() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const { data: customers, refetch } = useQuery(
    useCallback(() => getCustomers(debouncedSearch || undefined), [debouncedSearch])
  );
  const { sorted, sortKey, sortDir, toggleSort } = useSort<Customer>(customers);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [error, setError] = useState("");

  const [addrModalOpen, setAddrModalOpen] = useState(false);
  const [addrCustomer, setAddrCustomer] = useState<Customer | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [addrForm, setAddrForm] = useState({ label: "", alamat: "" });
  const [editingAddr, setEditingAddr] = useState<CustomerAddress | null>(null);
  const [addrError, setAddrError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingAddr, setSavingAddr] = useState(false);
  const [modalAddresses, setModalAddresses] = useState<CustomerAddress[]>([]);
  const [inlineAddrForm, setInlineAddrForm] = useState({ label: "", alamat: "" });

  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [priceCustomer, setPriceCustomer] = useState<Customer | null>(null);
  const [prices, setPrices] = useState<CustomerPrice[]>([]);
  const [addPriceOpen, setAddPriceOpen] = useState(false);
  const [selectedProdukId, setSelectedProdukId] = useState(0);
  const [selectedHarga, setSelectedHarga] = useState(0);
  const { data: allProducts } = useQuery(useCallback(() => getProducts(), []));

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setModalAddresses([]);
    setInlineAddrForm({ label: "", alamat: "" });
    setModalOpen(true);
  }

  async function openEdit(c: Customer) {
    setEditing(c);
    setForm({ nama: c.nama, telepon: c.telepon ?? "", alamat: c.alamat ?? "" });
    setError("");
    const addrs = await getCustomerAddresses(c.id);
    setModalAddresses(addrs);
    setInlineAddrForm({ label: "", alamat: "" });
    setModalOpen(true);
  }

  async function handleSave() {
    if (saving) return;
    if (!form.nama.trim()) { setError("Nama pelanggan wajib diisi"); return; }
    setSaving(true);
    try {
      const data = { nama: form.nama.trim(), telepon: form.telepon.trim() || null, alamat: form.alamat.trim() || null };
      if (editing) {
        await updateCustomer(editing.id, data);
      } else {
        const newId = await createCustomer(data);
        for (const addr of modalAddresses) {
          await addCustomerAddress(newId, addr.label, addr.alamat);
        }
      }
      setModalOpen(false);
      refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteCustomer(deleteTarget.id);
      setDeleteTarget(null);
      refetch();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      setDeleteTarget(null);
    }
  }

  async function openPrices(c: Customer) {
    setPriceCustomer(c);
    const p = await getCustomerPrices(c.id);
    setPrices(p);
    setPriceModalOpen(true);
  }

  async function handleAddPrice() {
    if (!priceCustomer || !selectedProdukId || selectedHarga <= 0) return;
    await setCustomerPrice(priceCustomer.id, selectedProdukId, selectedHarga);
    const p = await getCustomerPrices(priceCustomer.id);
    setPrices(p);
    setAddPriceOpen(false);
    setSelectedProdukId(0);
    setSelectedHarga(0);
  }

  async function handleRemovePrice(produkId: number) {
    if (!priceCustomer) return;
    await removeCustomerPrice(priceCustomer.id, produkId);
    const p = await getCustomerPrices(priceCustomer.id);
    setPrices(p);
  }

  async function openAddresses(c: Customer) {
    setAddrCustomer(c);
    const a = await getCustomerAddresses(c.id);
    setAddresses(a);
    setAddrForm({ label: "", alamat: "" });
    setEditingAddr(null);
    setAddrError("");
    setAddrModalOpen(true);
  }

  async function handleSaveAddr() {
    if (!addrCustomer || savingAddr) return;
    if (!addrForm.label.trim() || !addrForm.alamat.trim()) {
      setAddrError("Label dan alamat wajib diisi");
      return;
    }
    setSavingAddr(true);
    try {
      if (editingAddr) {
        await updateCustomerAddress(editingAddr.id, addrForm.label.trim(), addrForm.alamat.trim());
      } else {
        await addCustomerAddress(addrCustomer.id, addrForm.label.trim(), addrForm.alamat.trim());
      }
      const a = await getCustomerAddresses(addrCustomer.id);
      setAddresses(a);
      setAddrForm({ label: "", alamat: "" });
      setEditingAddr(null);
      setAddrError("");
    } catch (e) {
      setAddrError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingAddr(false);
    }
  }

  async function handleDeleteAddr(id: number) {
    if (!addrCustomer) return;
    await deleteCustomerAddress(id);
    const a = await getCustomerAddresses(addrCustomer.id);
    setAddresses(a);
  }

  async function handleAddInlineAddr() {
    if (!inlineAddrForm.label.trim() || !inlineAddrForm.alamat.trim()) return;
    if (editing) {
      await addCustomerAddress(editing.id, inlineAddrForm.label.trim(), inlineAddrForm.alamat.trim());
      const addrs = await getCustomerAddresses(editing.id);
      setModalAddresses(addrs);
    } else {
      setModalAddresses(prev => [...prev, {
        id: -(Date.now()),
        pelanggan_id: 0,
        label: inlineAddrForm.label.trim(),
        alamat: inlineAddrForm.alamat.trim(),
      }]);
    }
    setInlineAddrForm({ label: "", alamat: "" });
  }

  async function handleRemoveInlineAddr(addr: CustomerAddress) {
    if (editing) {
      await deleteCustomerAddress(addr.id);
      const addrs = await getCustomerAddresses(editing.id);
      setModalAddresses(addrs);
    } else {
      setModalAddresses(prev => prev.filter(a => a.id !== addr.id));
    }
  }

  const sh = (label: string, key: string) => (
    <SortableHead label={label} sortKey={key} active={sortKey === key} dir={sortDir} onSort={toggleSort} />
  );

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pelanggan</h1>
        <Button onClick={openAdd}><Plus className="size-4" /> Tambah</Button>
      </div>

      <div className="mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Cari nama atau telepon..." />
      </div>

      {sorted && sorted.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              {sh("Nama", "nama")}
              {sh("Telepon", "telepon")}
              {sh("Alamat Utama", "alamat")}
              <TableHead className="w-28">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.nama}</TableCell>
                <TableCell>{c.telepon || "-"}</TableCell>
                <TableCell className="max-w-48 truncate">{c.alamat || "-"}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon-xs" onClick={() => openAddresses(c)} title="Alamat">
                      <MapPin className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-xs" onClick={() => openPrices(c)} title="Harga Khusus">
                      <Tag className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-xs" onClick={() => openEdit(c)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-xs" onClick={() => setDeleteTarget(c)}>
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="py-12 text-center text-sm text-muted-foreground">Belum ada pelanggan</p>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Pelanggan" : "Tambah Pelanggan"}>
        <div className="space-y-3">
          <div>
            <Label>Nama</Label>
            <Input value={form.nama} onChange={(e) => set("nama", e.target.value)} placeholder="Nama pelanggan" autoFocus />
          </div>
          <div>
            <Label>Telepon</Label>
            <Input value={form.telepon} onChange={(e) => set("telepon", e.target.value)} placeholder="08xxxxxxxxxx" />
          </div>
          <div>
            <Label>Alamat Utama</Label>
            <Input value={form.alamat} onChange={(e) => set("alamat", e.target.value)} placeholder="Alamat utama (opsional)" />
          </div>
          <div>
            <Label>Alamat Pengiriman</Label>
            {modalAddresses.length > 0 && (
              <div className="mt-1 space-y-1.5">
                {modalAddresses.map((a) => (
                  <div key={a.id} className="flex items-start gap-2 rounded-md border p-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{a.label}</p>
                      <p className="truncate text-xs text-muted-foreground">{a.alamat}</p>
                    </div>
                    <Button variant="ghost" size="icon-xs" onClick={() => handleRemoveInlineAddr(a)}>
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 flex gap-2">
              <Input
                value={inlineAddrForm.label}
                onChange={(e) => setInlineAddrForm(f => ({ ...f, label: e.target.value }))}
                placeholder="Label"
                className="w-1/3"
              />
              <Input
                value={inlineAddrForm.alamat}
                onChange={(e) => setInlineAddrForm(f => ({ ...f, alamat: e.target.value }))}
                placeholder="Alamat lengkap"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleAddInlineAddr}
                disabled={!inlineAddrForm.label.trim() || !inlineAddrForm.alamat.trim()}
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={priceModalOpen} onClose={() => setPriceModalOpen(false)} title={`Harga Khusus - ${priceCustomer?.nama ?? ""}`}>
        <div className="space-y-3">
          {prices.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produk</TableHead>
                  <TableHead>Harga Default</TableHead>
                  <TableHead>Harga Khusus</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prices.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">{p.kode_produk}</span>{" "}
                      {p.nama_produk}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatRupiah(p.harga_jual_default ?? 0)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{formatRupiah(p.harga)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon-xs" onClick={() => handleRemovePrice(p.produk_id)}>
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">Belum ada harga khusus</p>
          )}

          {addPriceOpen ? (
            <div className="space-y-2 rounded-md border p-3">
              <div>
                <Label>Produk</Label>
                <SearchableSelect
                  options={
                    allProducts
                      ?.filter((p) => !prices.some((pr) => pr.produk_id === p.id))
                      .map((p) => ({ value: p.id, label: `[${p.kode}] ${p.nama} - ${formatRupiah(p.harga_jual)}` })) ?? []
                  }
                  value={selectedProdukId}
                  onChange={(id) => {
                    setSelectedProdukId(id);
                    const prod = allProducts?.find((p) => p.id === id);
                    if (prod) setSelectedHarga(prod.harga_jual);
                  }}
                  placeholder="Cari produk..."
                  emptyLabel="Pilih produk..."
                />
              </div>
              <div>
                <Label>Harga Khusus</Label>
                <Input type="number" value={selectedHarga || ""} onChange={(e) => setSelectedHarga(Number(e.target.value))} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setAddPriceOpen(false)}>Batal</Button>
                <Button size="sm" onClick={handleAddPrice} disabled={!selectedProdukId || selectedHarga <= 0}>Simpan</Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" className="w-full" onClick={() => setAddPriceOpen(true)}>
              <Plus className="size-4" /> Tambah Harga Khusus
            </Button>
          )}
        </div>
      </Modal>

      <Modal open={addrModalOpen} onClose={() => setAddrModalOpen(false)} title={`Alamat Pengiriman - ${addrCustomer?.nama ?? ""}`}>
        <div className="space-y-3">
          {addresses.length > 0 ? (
            <div className="space-y-2">
              {addresses.map((a) => (
                <div key={a.id} className="flex items-start gap-2 rounded-md border p-2">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{a.label}</p>
                    <p className="text-xs text-muted-foreground">{a.alamat}</p>
                  </div>
                  <Button variant="ghost" size="icon-xs" onClick={() => {
                    setEditingAddr(a);
                    setAddrForm({ label: a.label, alamat: a.alamat });
                    setAddrError("");
                  }}>
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon-xs" onClick={() => handleDeleteAddr(a.id)}>
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">Belum ada alamat</p>
          )}

          <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">{editingAddr ? "Edit Alamat" : "Tambah Alamat"}</p>
            <div>
              <Label>Label</Label>
              <Input
                value={addrForm.label}
                onChange={(e) => setAddrForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="cth: Alamat Tetap, Pengantaran 1"
                autoFocus
              />
            </div>
            <div>
              <Label>Alamat</Label>
              <Input
                value={addrForm.alamat}
                onChange={(e) => setAddrForm((f) => ({ ...f, alamat: e.target.value }))}
                placeholder="Alamat lengkap"
              />
            </div>
            {addrError && <p className="text-sm text-destructive">{addrError}</p>}
            <div className="flex justify-end gap-2">
              {editingAddr && (
                <Button variant="outline" size="sm" onClick={() => {
                  setEditingAddr(null);
                  setAddrForm({ label: "", alamat: "" });
                  setAddrError("");
                }}>Batal</Button>
              )}
              <Button size="sm" onClick={handleSaveAddr} disabled={savingAddr}>{savingAddr ? "Menyimpan..." : "Simpan"}</Button>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Hapus Pelanggan"
        message={`Yakin ingin menghapus "${deleteTarget?.nama}"?`}
      />
    </div>
  );
}
