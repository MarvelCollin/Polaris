import { describe, it, expect, beforeEach } from "vitest";
import { resetMock, mockDb } from "./setup";
import {
  getCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerPrices,
  setCustomerPrice,
  removeCustomerPrice,
  getCustomerPriceMap,
} from "@/db/customers";

describe("customers", () => {
  beforeEach(() => {
    resetMock();
  });

  it("should fetch all customers ordered by name", async () => {
    const mockCustomers = [
      { id: 1, nama: "CV Bangun Jaya", telepon: "082345678901", alamat: "Jl. Industri No. 5", dibuat_pada: 1000 },
      { id: 2, nama: "Pak Budi", telepon: "081234567890", alamat: null, dibuat_pada: 1001 },
    ];
    mockDb.select.mockResolvedValueOnce(mockCustomers);
    const result = await getCustomers();
    expect(result).toHaveLength(2);
    expect(result[0].nama).toBe("CV Bangun Jaya");
    expect(mockDb.select).toHaveBeenCalledWith("SELECT * FROM pelanggan ORDER BY nama");
  });

  it("should search customers by name or phone", async () => {
    mockDb.select.mockResolvedValueOnce([]);
    await getCustomers("budi");
    const call = mockDb.select.mock.calls[0];
    expect((call[0] as string)).toContain("nama LIKE $1 OR telepon LIKE $1");
    expect(call[1]).toEqual(["%budi%"]);
  });

  it("should create a customer and return id", async () => {
    mockDb.execute.mockResolvedValueOnce({ lastInsertId: 3, rowsAffected: 1 });
    const id = await createCustomer({ nama: "Pak Budi", telepon: "081234567890", alamat: "Jl. Merdeka" });
    expect(id).toBe(3);
    expect(mockDb.execute).toHaveBeenCalledWith(
      "INSERT INTO pelanggan (nama, telepon, alamat) VALUES ($1, $2, $3)",
      ["Pak Budi", "081234567890", "Jl. Merdeka"]
    );
  });

  it("should create a customer with null phone and address", async () => {
    mockDb.execute.mockResolvedValueOnce({ lastInsertId: 4, rowsAffected: 1 });
    const id = await createCustomer({ nama: "Toko ABC", telepon: null, alamat: null });
    expect(id).toBe(4);
    const call = mockDb.execute.mock.calls[0][1] as unknown[];
    expect(call[1]).toBeNull();
    expect(call[2]).toBeNull();
  });

  it("should update a customer", async () => {
    await updateCustomer(1, { nama: "Pak Budi Updated", telepon: "089999999999", alamat: "Jl. Baru" });
    expect(mockDb.execute).toHaveBeenCalledWith(
      "UPDATE pelanggan SET nama=$1, telepon=$2, alamat=$3 WHERE id=$4",
      ["Pak Budi Updated", "089999999999", "Jl. Baru", 1]
    );
  });

  it("should delete a customer with no transactions", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    await deleteCustomer(1);
    expect(mockDb.execute).toHaveBeenCalledWith("DELETE FROM pelanggan WHERE id = $1", [1]);
  });

  it("should throw when deleting a customer with transactions", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 5 }]);
    await expect(deleteCustomer(1)).rejects.toThrow(
      "Pelanggan tidak dapat dihapus karena sudah memiliki transaksi"
    );
  });

  it("should fetch customer prices with product details", async () => {
    const mockPrices = [
      { id: 1, pelanggan_id: 1, produk_id: 1, harga: 52200, nama_produk: "Semen", kode_produk: "SMN-001", harga_jual_default: 58000 },
    ];
    mockDb.select.mockResolvedValueOnce(mockPrices);
    const result = await getCustomerPrices(1);
    expect(result).toEqual(mockPrices);
    const call = mockDb.select.mock.calls[0][0] as string;
    expect(call).toContain("JOIN produk");
    expect(call).toContain("WHERE hp.pelanggan_id = $1");
  });

  it("should set a customer price (upsert)", async () => {
    await setCustomerPrice(1, 5, 50000);
    const call = mockDb.execute.mock.calls[0];
    expect((call[0] as string)).toContain("INSERT INTO harga_pelanggan");
    expect((call[0] as string)).toContain("ON CONFLICT");
    expect(call[1]).toEqual([1, 5, 50000]);
  });

  it("should remove a customer price", async () => {
    await removeCustomerPrice(1, 5);
    expect(mockDb.execute).toHaveBeenCalledWith(
      "DELETE FROM harga_pelanggan WHERE pelanggan_id = $1 AND produk_id = $2",
      [1, 5]
    );
  });

  it("should return a price map for a customer", async () => {
    mockDb.select.mockResolvedValueOnce([
      { produk_id: 1, harga: 52200 },
      { produk_id: 2, harga: 49500 },
      { produk_id: 5, harga: 42000 },
    ]);
    const map = await getCustomerPriceMap(1);
    expect(map).toEqual({ 1: 52200, 2: 49500, 5: 42000 });
  });

  it("should return empty map when customer has no prices", async () => {
    mockDb.select.mockResolvedValueOnce([]);
    const map = await getCustomerPriceMap(99);
    expect(map).toEqual({});
  });
});
