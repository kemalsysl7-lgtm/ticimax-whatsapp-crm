import * as soap from "soap";
import {
  mapCart,
  mapMember,
  mapOrder,
  mapProductAlarm,
  mapShipmentPackage,
  toArray,
  type Cart,
  type Member,
  type Order,
  type ProductAlarm,
  type ShipmentPackage,
} from "./mapper";

/**
 * Ticimax SOAP (WCF) servisleri için istemci.
 *
 * İki WCF ayrıntısı burada ele alınır:
 *  1. Metot parametre adları dokümanda yok; WSDL'deki sıraya göre konumsal eşlenir
 *     (dokümandaki parametre sırası = WSDL sırası).
 *  2. WCF DataContractSerializer, nesne alanlarını alfabetik sırada bekler; sırası
 *     bozuk alanları hata vermeden YOK SAYAR. Bu yüzden tüm nesneler alfabetik sıralanır.
 */
export type TicimaxService = "UyeServis" | "SiparisServis" | "UrunServis" | "CustomServis";

export interface TicimaxConfig {
  baseUrl: string;
  uyeKodu: string;
}

/** Test edilebilirlik için node-soap istemcisinin kullandığımız kısmı. */
export interface SoapClientLike {
  describe(): Record<string, Record<string, Record<string, { input: Record<string, unknown> | string }>>>;
  [method: string]: unknown;
}

export type SoapClientFactory = (wsdlUrl: string) => Promise<SoapClientLike>;

const defaultFactory: SoapClientFactory = async (url) =>
  (await soap.createClientAsync(url)) as unknown as SoapClientLike;

/**
 * WCF DataContract sırası: iç içe nesneler dahil tüm anahtarları alfabetik sıralar.
 * `undefined` alanlar hiç gönderilmez (ör. filtre uygulanmayacak tarih alanları).
 */
export function wcfOrder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(wcfOrder);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.keys(value)
        .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
        .map((k) => [k, wcfOrder((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

export class TicimaxError extends Error {
  constructor(service: TicimaxService, method: string, cause: unknown) {
    // Ticimax hata mesajında UyeKodu bulunmaz; yine de yalnızca mesaj metni alınır.
    super(`Ticimax ${service}.${method} çağrısı başarısız: ${(cause as Error)?.message ?? "bilinmeyen hata"}`);
  }
}

export class TicimaxClient {
  private readonly clients = new Map<TicimaxService, Promise<SoapClientLike>>();

  constructor(
    private readonly config: TicimaxConfig,
    private readonly factory: SoapClientFactory = defaultFactory,
  ) {}

  private client(service: TicimaxService): Promise<SoapClientLike> {
    let c = this.clients.get(service);
    if (!c) {
      const url = `${this.config.baseUrl.replace(/\/$/, "")}/Servis/${service}.svc?wsdl`;
      c = this.factory(url);
      c.catch(() => this.clients.delete(service));
      this.clients.set(service, c);
    }
    return c;
  }

  private static inputParamNames(client: SoapClientLike, method: string): string[] {
    for (const service of Object.values(client.describe())) {
      for (const port of Object.values(service)) {
        const op = port[method];
        if (op && typeof op.input === "object") {
          return Object.keys(op.input).filter((k) => k !== "targetNSAlias" && k !== "targetNamespace");
        }
      }
    }
    throw new Error(`WSDL'de ${method} metodu bulunamadı`);
  }

  /** Metodu, ilk parametresi UyeKodu olacak şekilde konumsal argümanlarla çağırır. */
  async call(service: TicimaxService, method: string, args: unknown[]): Promise<unknown> {
    try {
      const client = await this.client(service);
      const names = TicimaxClient.inputParamNames(client, method);
      const values = [this.config.uyeKodu, ...args];
      if (names.length !== values.length) {
        throw new Error(`${method}: WSDL ${names.length} parametre bekliyor, ${values.length} verildi`);
      }
      const input = Object.fromEntries(names.map((n, i) => [n, wcfOrder(values[i])]));
      const fn = client[`${method}Async`] as (input: unknown) => Promise<[unknown]>;
      const [result] = await fn.call(client, input);
      return result;
    } catch (err) {
      throw new TicimaxError(service, method, err);
    }
  }

  /** WCF liste sonucunu ({ SelectUyelerResult: { Uye: [...] } }) düz diziye çevirir. */
  private static unwrapList(result: unknown, method: string, itemName: string): Record<string, unknown>[] {
    const wrapper = (result as Record<string, unknown> | null)?.[`${method}Result`] as Record<string, unknown> | undefined;
    return toArray(wrapper?.[itemName]);
  }

  /** `updatedFrom` verilmezse tarih filtresi uygulanmaz (ilk tam senkron: hiç düzenlenmemiş üyeler de gelir). */
  async selectMembers(params: { updatedFrom?: Date; updatedTo?: Date; page: number; pageSize: number }): Promise<Member[]> {
    const filter = {
      Aktif: -1,
      AlisverisYapti: -1,
      Cinsiyet: -1,
      DuzenlemeTarihi1: params.updatedFrom,
      DuzenlemeTarihi2: params.updatedTo,
      MailIzin: -1,
      SmsIzin: -1,
      UyeID: -1,
    };
    const paging = { KayitSayisi: params.pageSize, SayfaNo: params.page, SiralamaDegeri: "id", SiralamaYonu: "ASC" };
    const result = await this.call("UyeServis", "SelectUyeler", [filter, paging]);
    return TicimaxClient.unwrapList(result, "SelectUyeler", "Uye")
      .map(mapMember)
      .filter((m): m is Member => m !== null);
  }

  async selectOrders(params: { from: Date; to: Date; offset: number; pageSize: number }): Promise<Order[]> {
    const filter = {
      EntegrasyonAktarildi: -1,
      EntegrasyonParams: { AlanDeger: "", Deger: "", EntegrasyonKodu: "", EntegrasyonParamsAktif: false, TabloAlan: "", Tanim: "" },
      FaturaNo: "",
      IptalEdilmisUrunler: true,
      OdemeDurumu: -1,
      OdemeTipi: -1,
      SiparisDurumu: -1,
      SiparisID: -1,
      SiparisKaynagi: "",
      SiparisKodu: "",
      SiparisNo: "",
      SiparisTarihiBas: params.from,
      SiparisTarihiSon: params.to,
      StrSiparisDurumu: "",
      TedarikciID: -1,
      UyeID: -1,
      UyeTelefon: "",
    };
    const paging = { BaslangicIndex: params.offset, KayitSayisi: params.pageSize, SiralamaDegeri: "id", SiralamaYonu: "ASC" };
    const result = await this.call("SiparisServis", "SelectSiparis", [filter, paging]);
    return TicimaxClient.unwrapList(result, "SelectSiparis", "WebSiparis")
      .map(mapOrder)
      .filter((o): o is Order => o !== null);
  }

  async selectShipmentPackages(orderTicimaxId: number): Promise<ShipmentPackage[]> {
    const filter = {
      KargoEntegrasyonID: -1,
      KargoTakipNoDurum: -1,
      PaketlenmeTarihBas: new Date("2000-01-01T00:00:00Z"),
      PaketlenmeTarihBit: new Date(Date.now() + 86_400_000),
      SiparisID: orderTicimaxId,
      SiparisKargoPaketID: -1,
    };
    const result = await this.call("SiparisServis", "SelectSiparisKargoPaket", [filter]);
    return TicimaxClient.unwrapList(result, "SelectSiparisKargoPaket", "WebKargoPaket")
      .map(mapShipmentPackage)
      .filter((p): p is ShipmentPackage => p !== null);
  }

  /**
   * Belirli tarih aralığında güncellenmiş sepetler. Sepet/üye id'sinde -1 "filtre yok"
   * anlamına gelir (Ticimax'in genel kuralı); ilk gerçek bağlantıda doğrulanmalı.
   */
  async selectCarts(params: { from: Date; to: Date }): Promise<Cart[]> {
    const result = await this.call("SiparisServis", "SelectSepet", [-1, -1, params.from, params.to]);
    return TicimaxClient.unwrapList(result, "SelectSepet", "WebSepet")
      .map(mapCart)
      .filter((c): c is Cart => c !== null);
  }

  async selectPriceAlarms(memberTicimaxId: number): Promise<ProductAlarm[]> {
    const result = await this.call("CustomServis", "GetFiyatAlarmUrunler", [{ UyeID: memberTicimaxId }]);
    return TicimaxClient.unwrapResponseList(result, "GetFiyatAlarmUrunler", "WebFiyatAlarmUrunler")
      .map((r) => mapProductAlarm(r, "FiyatAlarmUrunID"))
      .filter((a): a is ProductAlarm => a !== null);
  }

  async selectStockAlarms(memberTicimaxId: number): Promise<ProductAlarm[]> {
    const result = await this.call("CustomServis", "GetStokAlarmUrunler", [{ UyeID: memberTicimaxId }]);
    return TicimaxClient.unwrapResponseList(result, "GetStokAlarmUrunler", "WebStokAlarmUrunler")
      .map((r) => mapProductAlarm(r, "StokAlarmUrunId"))
      .filter((a): a is ProductAlarm => a !== null);
  }

  /** `{ XResult: { IsError, ErrorMessage, Urunler: { Item: [...] } } }` biçimindeki yanıtlar. */
  private static unwrapResponseList(result: unknown, method: string, itemName: string): Record<string, unknown>[] {
    const response = (result as Record<string, unknown> | null)?.[`${method}Result`] as Record<string, unknown> | undefined;
    if (response?.IsError === true || response?.IsError === "true") {
      throw new Error(`${method}: ${String(response.ErrorMessage ?? "Ticimax hata döndürdü")}`);
    }
    return toArray((response?.Urunler as Record<string, unknown> | undefined)?.[itemName]);
  }
}
