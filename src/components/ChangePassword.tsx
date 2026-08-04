import { useState, FormEvent } from "react";
import { changePassword } from "@/db/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Modal from "./Modal";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ChangePassword({ open, onClose }: Props) {
  const [current, setCurrent] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function reset() {
    setCurrent("");
    setNewPw("");
    setConfirm("");
    setError("");
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!current || !newPw || !confirm) {
      setError("Semua field harus diisi");
      return;
    }

    if (newPw !== confirm) {
      setError("Password baru tidak cocok");
      return;
    }

    if (newPw.length < 4) {
      setError("Password minimal 4 karakter");
      return;
    }

    setLoading(true);
    const success = await changePassword(current, newPw);
    setLoading(false);

    if (success) {
      handleClose();
    } else {
      setError("Password lama salah");
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Ubah Password">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>Password Lama</Label>
          <Input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <Label>Password Baru</Label>
          <Input
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Konfirmasi Password Baru</Label>
          <Input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={handleClose}>
            Batal
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
