import { useState, useCallback, useMemo } from "react";
import { useQuery } from "@/hooks/useQuery";
import { useSort } from "@/hooks/useSort";
import { useDebounce } from "@/hooks/useDebounce";
import { getCategories, createCategory, updateCategory, deleteCategory } from "@/db/categories";
import { Category } from "@/types/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SearchInput from "@/components/SearchInput";
import {
  Table, TableBody, TableCell, TableHeader, TableRow,
} from "@/components/ui/table";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ConfirmDialog";
import SortableHead from "@/components/SortableHead";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { TableHead } from "@/components/ui/table";

export default function Categories() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const { data: categories, refetch } = useQuery(useCallback(() => getCategories(), []));
  const filtered = useMemo(() => {
    if (!categories || !debouncedSearch) return categories;
    const q = debouncedSearch.toLowerCase();
    return categories.filter((c) => c.nama.toLowerCase().includes(q));
  }, [categories, debouncedSearch]);
  const { sorted, sortKey, sortDir, toggleSort } = useSort<Category>(filtered);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [nama, setNama] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function openAdd() {
    setEditing(null);
    setNama("");
    setError("");
    setModalOpen(true);
  }

  function openEdit(cat: Category) {
    setEditing(cat);
    setNama(cat.nama);
    setError("");
    setModalOpen(true);
  }

  async function handleSave() {
    if (saving) return;
    if (!nama.trim()) { setError("Nama kategori wajib diisi"); return; }
    setSaving(true);
    try {
      if (editing) {
        await updateCategory(editing.id, nama.trim());
      } else {
        await createCategory(nama.trim());
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
      await deleteCategory(deleteTarget.id);
      setDeleteTarget(null);
      refetch();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      setDeleteTarget(null);
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Kategori</h1>
        <Button onClick={openAdd}><Plus className="size-4" /> Tambah</Button>
      </div>
      <div className="mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Cari kategori..." />
      </div>

      {sorted && sorted.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead label="Nama" sortKey="nama" active={sortKey === "nama"} dir={sortDir} onSort={toggleSort} />
              <TableHead className="w-24">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((cat) => (
              <TableRow key={cat.id}>
                <TableCell>{cat.nama}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon-xs" onClick={() => openEdit(cat)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-xs" onClick={() => setDeleteTarget(cat)}>
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="py-12 text-center text-sm text-muted-foreground">Belum ada kategori</p>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Kategori" : "Tambah Kategori"}>
        <div className="space-y-4">
          <div>
            <Label>Nama Kategori</Label>
            <Input value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Contoh: Semen" autoFocus />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Hapus Kategori"
        message={`Yakin ingin menghapus kategori "${deleteTarget?.nama}"?`}
      />
    </div>
  );
}
