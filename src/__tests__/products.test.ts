import { describe, it, expect, beforeEach } from "vitest";
import { resetMock, mockDb } from "./setup";
import { getProducts, getProduct, createProduct, updateProduct, deleteProduct, getLowStockProducts, generateProductCode } from "@/db/products";

describe("products", () => {
  beforeEach(() => {
    resetMock();
  });

  it("should fetch all products with category join", async () => {
    const mockProducts = [
      { id: 1, kode: "SMN-001", nama: "Semen Tiga Roda", kategori_nama: "Semen" },
    ];
    mockDb.select.mockResolvedValueOnce(mockProducts);
    const result = await getProducts();
    expect(result).toEqual(mockProducts);
    const call = mockDb.select.mock.calls[0][0] as string;
    expect(call).toContain("JOIN kategori");
    expect(call).toContain("ORDER BY p.nama");
  });

  it("should filter products by search term", async () => {
    mockDb.select.mockResolvedValueOnce([]);
    await getProducts("semen");
    const call = mockDb.select.mock.calls[0];
    expect((call[0] as string)).toContain("p.nama LIKE $1 OR p.kode LIKE $1");
    expect(call[1]).toEqual(["%semen%"]);
  });

  it("should filter products by category", async () => {
    mockDb.select.mockResolvedValueOnce([]);
    await getProducts(undefined, 2);
    const call = mockDb.select.mock.calls[0];
    expect((call[0] as string)).toContain("p.kategori_id = $1");
    expect(call[1]).toEqual([2]);
  });

  it("should filter products by search and category", async () => {
    mockDb.select.mockResolvedValueOnce([]);
    await getProducts("semen", 2);
    const call = mockDb.select.mock.calls[0];
    expect((call[0] as string)).toContain("p.nama LIKE $1 OR p.kode LIKE $1");
    expect((call[0] as string)).toContain("p.kategori_id = $2");
    expect(call[1]).toEqual(["%semen%", 2]);
  });

  it("should get a single product by id", async () => {
    const mockProduct = { id: 1, kode: "SMN-001", nama: "Semen" };
    mockDb.select.mockResolvedValueOnce([mockProduct]);
    const result = await getProduct(1);
    expect(result).toEqual(mockProduct);
    expect(mockDb.select).toHaveBeenCalledWith("SELECT * FROM produk WHERE id = $1", [1]);
  });

  it("should return null for non-existent product", async () => {
    mockDb.select.mockResolvedValueOnce([]);
    const result = await getProduct(999);
    expect(result).toBeNull();
  });

  it("should create a product", async () => {
    mockDb.execute.mockResolvedValueOnce({ lastInsertId: 10, rowsAffected: 1 });
    const data = {
      kode: "SMN-001",
      nama: "Semen Tiga Roda",
      kategori_id: 1,
      satuan: "sak",
      harga_beli: 52000,
      harga_jual: 58000,
      stok: 100,
      stok_minimum: 20,
    };
    const id = await createProduct(data);
    expect(id).toBe(10);
    expect(mockDb.execute).toHaveBeenCalledTimes(1);
  });

  it("should update a product", async () => {
    const data = {
      kode: "SMN-001",
      nama: "Semen Updated",
      kategori_id: 1,
      satuan: "sak",
      harga_beli: 55000,
      harga_jual: 60000,
      stok: 120,
      stok_minimum: 25,
    };
    await updateProduct(1, data);
    const call = mockDb.execute.mock.calls[0][0] as string;
    expect(call).toContain("UPDATE produk SET");
    expect(call).toContain("WHERE id = $10");
  });

  it("should delete a product with no transactions", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    await deleteProduct(1);
    expect(mockDb.execute).toHaveBeenCalledWith("DELETE FROM produk WHERE id = $1", [1]);
  });

  it("should throw when deleting a product with sales", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 5 }]);
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    await expect(deleteProduct(1)).rejects.toThrow(
      "Produk tidak dapat dihapus karena sudah memiliki transaksi"
    );
  });

  it("should throw when deleting a product with purchases", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.select.mockResolvedValueOnce([{ count: 3 }]);
    await expect(deleteProduct(1)).rejects.toThrow(
      "Produk tidak dapat dihapus karena sudah memiliki transaksi"
    );
  });

  it("should generate product code based on max id", async () => {
    mockDb.select.mockResolvedValueOnce([{ max_id: 15 }]);
    const code = await generateProductCode();
    expect(code).toBe("PRD-0016");
  });

  it("should generate PRD-0001 when no products exist", async () => {
    mockDb.select.mockResolvedValueOnce([{ max_id: null }]);
    const code = await generateProductCode();
    expect(code).toBe("PRD-0001");
  });

  it("should create product with gambar", async () => {
    mockDb.execute.mockResolvedValueOnce({ lastInsertId: 11, rowsAffected: 1 });
    mockDb.select.mockResolvedValueOnce([{ max_id: 10 }]);
    const data = {
      kode: "",
      nama: "Semen",
      kategori_id: 1,
      satuan: "sak",
      harga_beli: 52000,
      harga_jual: 58000,
      stok: 100,
      stok_minimum: 20,
      gambar: "/path/to/image.jpg",
    };
    const id = await createProduct(data);
    expect(id).toBe(11);
    const call = mockDb.execute.mock.calls.find((c: unknown[]) => (c[0] as string).includes("INSERT INTO produk"));
    expect(call).toBeDefined();
    expect(call![1]).toContain("/path/to/image.jpg");
  });

  it("should fetch low stock products", async () => {
    const lowStock = [{ id: 1, nama: "Besi 12mm", stok: 5, stok_minimum: 20 }];
    mockDb.select.mockResolvedValueOnce(lowStock);
    const result = await getLowStockProducts();
    expect(result).toEqual(lowStock);
    const call = mockDb.select.mock.calls[0][0] as string;
    expect(call).toContain("p.stok <= p.stok_minimum");
  });
});
