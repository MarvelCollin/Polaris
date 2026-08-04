import { useState, useCallback } from "react";
import { useQuery } from "@/hooks/useQuery";
import { getCategories, createCategory, updateCategory, deleteCategory } from "@/db/categories";
import { Category } from "@/types/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Plus, Pencil, Trash2 } from "lucide-react";

export default function Categories() {
  const { data: categories, refetch } = useQuery(useCallback(() => getCategories(), []));
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [nama, setNama] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [error, setError] = useState("");

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
    if (!nama.trim()) { setError("Nama kategori wajib diisi"); return; }
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
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Kategori</h1>
        <Button onClick={openAdd}><Plus className="size-4" /> Tambah</Button>
      </div>

      {categories && categories.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead className="w-24">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((cat) => (
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
            <Button onClick={handleSave}>Simpan</Button>
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
