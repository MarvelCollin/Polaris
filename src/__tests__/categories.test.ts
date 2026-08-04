import { describe, it, expect, beforeEach } from "vitest";
import { resetMock, mockDb } from "./setup";
import { getCategories, createCategory, updateCategory, deleteCategory } from "@/db/categories";

describe("categories", () => {
  beforeEach(() => {
    resetMock();
  });

  it("should fetch all categories ordered by name", async () => {
    mockDb.select.mockResolvedValueOnce([
      { id: 1, nama: "Cat", dibuat_pada: 1000 },
      { id: 2, nama: "Semen", dibuat_pada: 1001 },
    ]);
    const result = await getCategories();
    expect(result).toHaveLength(2);
    expect(result[0].nama).toBe("Cat");
    expect(mockDb.select).toHaveBeenCalledWith("SELECT * FROM kategori ORDER BY nama");
  });

  it("should create a category and return its id", async () => {
    mockDb.execute.mockResolvedValueOnce({ lastInsertId: 5, rowsAffected: 1 });
    const id = await createCategory("Semen");
    expect(id).toBe(5);
    expect(mockDb.execute).toHaveBeenCalledWith(
      "INSERT INTO kategori (nama) VALUES ($1)",
      ["Semen"]
    );
  });

  it("should update a category", async () => {
    await updateCategory(1, "Semen Baru");
    expect(mockDb.execute).toHaveBeenCalledWith(
      "UPDATE kategori SET nama = $1 WHERE id = $2",
      ["Semen Baru", 1]
    );
  });

  it("should delete a category with no products", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    await deleteCategory(1);
    expect(mockDb.execute).toHaveBeenCalledWith(
      "DELETE FROM kategori WHERE id = $1",
      [1]
    );
  });

  it("should throw when deleting a category with products", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 3 }]);
    await expect(deleteCategory(1)).rejects.toThrow(
      "Kategori tidak dapat dihapus karena masih memiliki produk"
    );
  });
});
