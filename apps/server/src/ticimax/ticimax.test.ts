import { describe, expect, it, vi } from "vitest";
import { TicimaxClient, TicimaxError, wcfOrder, type SoapClientLike } from "./client";
import { mapMember, mapOrder, mapShipmentPackage, toDate, toDateOnly } from "./mapper";

describe("mapper", () => {
  it("üyeyi normalize eder", () => {
    expect(
      mapMember({
        ID: "42",
        Isim: " Ayşe ",
        Soyisim: "Yılmaz",
        Mail: "Ayse@Example.com",
        CepTelefonu: "0532 123 45 67",
        DogumTarihi: "1994-12-10T00:00:00",
        SmsIzin: "true",
        MailIzin: false,
        UyeTuruID: 1,
        DuzenlemeTarihi: "0001-01-01T00:00:00",
      }),
    ).toEqual({
      ticimaxId: 42,
      firstName: "Ayşe",
      lastName: "Yılmaz",
      email: "ayse@example.com",
      phone: "905321234567",
      birthDate: "1994-12-10",
      smsPermission: true,
      mailPermission: false,
      memberTypeId: 1,
      updatedAt: null,
    });
  });

  it("cep telefonu yoksa sabit telefonu dener, ikisi de geçersizse null", () => {
    expect(mapMember({ ID: 1, Telefon: "5321234567" })?.phone).toBe("905321234567");
    expect(mapMember({ ID: 1, CepTelefonu: "0212 000 00 00" })?.phone).toBeNull();
  });

  it("ID'siz kaydı atlar", () => {
    expect(mapMember({ Isim: "x" })).toBeNull();
    expect(mapOrder({})).toBeNull();
  });

  it("siparişi durum adıyla eşler", () => {
    const order = mapOrder({
      ID: 588,
      UyeID: 42,
      Durum: "6",
      UyeAdi: "Ayşe",
      UyeSoyadi: "Yılmaz",
      SiparisToplamTutari: "1249.9",
      ParaBirimi: "TL",
      SiparisTarihi: "2026-09-20T14:30:00",
      KargoFirmaId: 2,
      KargoTakipNo: "123",
      TeslimatAdresi: { AliciTelefon: "05321234567" },
    });
    expect(order).toMatchObject({
      ticimaxId: 588,
      memberTicimaxId: 42,
      statusCode: 6,
      statusName: "Kargoya verildi",
      customerName: "Ayşe Yılmaz",
      deliveryPhone: "905321234567",
      total: 1249.9,
      trackingNo: "123",
    });
  });

  it("kargo paketini eşler", () => {
    expect(
      mapShipmentPackage({ ID: 7, SiparisID: 588, KargoEntegrasyonTanim: "Yurtiçi", KargoTakipNumarasi: "999", KargoTakipLink: "" }),
    ).toEqual({ ticimaxId: 7, orderTicimaxId: 588, carrierName: "Yurtiçi", trackingNo: "999", trackingLink: null, createdAt: null });
  });

  it("WCF boş tarihini null sayar", () => {
    expect(toDate("0001-01-01T00:00:00")).toBeNull();
    expect(toDateOnly("0001-01-01T00:00:00")).toBeNull();
    expect(toDateOnly(new Date(2000, 1, 29))).toBe("2000-02-29");
  });
});

describe("wcfOrder", () => {
  it("iç içe nesneleri alfabetik sıralar, tarihleri bozmaz", () => {
    const d = new Date("2026-01-01T00:00:00Z");
    const ordered = wcfOrder({ b: 1, a: { z: 1, c: d }, Aa: [{ y: 1, x: 2 }] }) as Record<string, unknown>;
    expect(Object.keys(ordered)).toEqual(["Aa", "a", "b"]);
    expect(Object.keys(ordered.a as object)).toEqual(["c", "z"]);
    expect((ordered.a as { c: Date }).c).toBe(d);
    expect(Object.keys((ordered.Aa as object[])[0]!)).toEqual(["x", "y"]);
  });
});

function fakeSoapClient(method: string, paramNames: string[], result: unknown) {
  const fn = vi.fn(async () => [result]);
  const client: SoapClientLike = {
    describe: () => ({
      Svc: {
        Port: {
          [method]: {
            input: Object.fromEntries([...paramNames.map((n) => [n, "x"]), ["targetNSAlias", "tns"], ["targetNamespace", "ns"]]),
          },
        },
      },
    }),
    [`${method}Async`]: fn,
  };
  return { client, fn };
}

describe("TicimaxClient", () => {
  const config = { baseUrl: "https://magaza.com/", uyeKodu: "GIZLI" };

  it("WSDL parametre adlarına konumsal eşler ve UyeKodu'yu ilk sıraya koyar", async () => {
    const { client, fn } = fakeSoapClient("SelectUyeler", ["UyeKodu", "filtre", "sayfalama"], {
      SelectUyelerResult: { Uye: { ID: 5, Isim: "Ali", CepTelefonu: "5321234567" } },
    });
    const factory = vi.fn(async () => client);
    const ticimax = new TicimaxClient(config, factory);

    const members = await ticimax.selectMembers({
      updatedFrom: new Date("2026-09-01T00:00:00Z"),
      updatedTo: new Date("2026-09-24T00:00:00Z"),
      page: 1,
      pageSize: 100,
    });

    expect(factory).toHaveBeenCalledWith("https://magaza.com/Servis/UyeServis.svc?wsdl");
    const input = (fn.mock.calls[0] as unknown as [Record<string, Record<string, unknown>>])[0];
    expect(Object.keys(input)).toEqual(["UyeKodu", "filtre", "sayfalama"]);
    expect(input.UyeKodu).toBe("GIZLI");
    expect(Object.keys(input.filtre!)).toEqual([...Object.keys(input.filtre!)].sort());
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ ticimaxId: 5, phone: "905321234567" });
  });

  it("parametre sayısı uyuşmazsa ve SOAP hatasında TicimaxError fırlatır, UyeKodu'yu sızdırmaz", async () => {
    const { client } = fakeSoapClient("SelectUyeler", ["UyeKodu", "filtre"], {});
    const ticimax = new TicimaxClient(config, async () => client);
    const err = await ticimax
      .selectMembers({ updatedFrom: new Date(), updatedTo: new Date(), page: 1, pageSize: 1 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TicimaxError);
    expect((err as Error).message).toContain("2 parametre bekliyor");
    expect((err as Error).message).not.toContain("GIZLI");
  });

  it("boş liste sonucunu boş diziye çevirir", async () => {
    const { client } = fakeSoapClient("SelectSiparis", ["UyeKodu", "f", "s"], { SelectSiparisResult: null });
    const ticimax = new TicimaxClient(config, async () => client);
    await expect(ticimax.selectOrders({ from: new Date(), to: new Date(), offset: 0, pageSize: 50 })).resolves.toEqual([]);
  });
});
