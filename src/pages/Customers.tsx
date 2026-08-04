import { useState, useCallback } from "react";
import { useQuery } from "@/hooks/useQuery";
import { useDebounce } from "@/hooks/useDebounce";
import { getCustomers, createCustomer, updateCustomer, deleteCustomer, getCustomerPrices, setCustomerPrice, removeCustomerPrice } from "@/db/customers";
import { getProducts } from "@/db/products";
import { Customer, CustomerPrice, formatRupiah } from "@/types/index";
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
import { Plus, Pencil, Trash2, Tag } from "lucide-react";

const emptyForm = { nama: "", telepon: "", alamat: "" };

export default function Customers() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const { data: customers, refetch } = useQuery(
    useCallback(() => getCustomers(debouncedSearch || undefined), [debouncedSearch])
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [error, setError] = useState("");

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
    setModalOpen(true);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    setForm({ nama: c.nama, telepon: c.telepon ?? "", alamat: c.alamat ?? "" });
    setError("");
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.nama.trim()) { setError("Nama pelanggan wajib diisi"); return; }
    try {
      const data = { nama: form.nama.trim(), telepon: form.telepon.trim() || null, alamat: form.alamat.trim() || null };
      if (editing) {
        await updateCustomer(editing.id, data);
      } else {
        await createCustomer(data);
      }
      setModalOpen(false);
      refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pelanggan</h1>
        <Button onClick={openAdd}><Plus className="size-4" /> Tambah</Button>
      </div>

      <div className="mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Cari nama atau telepon..." />
      </div>

      {customers && customers.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Telepon</TableHead>
              <TableHead>Alamat</TableHead>
              <TableHead className="w-28">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.nama}</TableCell>
                <TableCell>{c.telepon || "-"}</TableCell>
                <TableCell className="max-w-48 truncate">{c.alamat || "-"}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
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
            <Label>Alamat</Label>
            <Input value={form.alamat} onChange={(e) => set("alamat", e.target.value)} placeholder="Alamat (opsional)" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
            <Button onClick={handleSave}>Simpan</Button>
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
                <select
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={selectedProdukId}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    setSelectedProdukId(id);
                    const prod = allProducts?.find((p) => p.id === id);
                    if (prod) setSelectedHarga(prod.harga_jual);
                  }}
                >
                  <option value={0}>Pilih produk...</option>
                  {allProducts
                    ?.filter((p) => !prices.some((pr) => pr.produk_id === p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>[{p.kode}] {p.nama} - {formatRupiah(p.harga_jual)}</option>
                    ))}
                </select>
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
