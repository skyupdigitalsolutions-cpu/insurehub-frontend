import { api, apiFull } from './client';
import type { FileInfo } from './profile';

/** Module 6: a customer's vehicles (P-54). RC and photos are document versions belonging to the vehicle. */
export interface FileVersion { documentId: string; version: number; uploadedAt: string; file: FileInfo | null }
export interface VehicleView {
  id: string; customerId: string; registration: string; vehicleType: string; make: string; model: string; year: number; fuel: string;
  status: 'ACTIVE' | 'INACTIVE'; version: number; createdAt: string; rc: FileVersion[]; photos: Array<{ slot: string; versions: FileVersion[] }>;
}
export interface VehicleRules { minPhotos: number; slots: string[]; maxVehicles: number; earliestYear: number; vehicleTypes: string[]; fuels: string[] }
export interface VehicleCreate {
  registration: string; vehicleType: string; make: string; model: string; year: string; fuel: string; rcFileId: string; photos: Array<{ slot: string; fileId: string }>;
}

export const vehiclesApi = {
  forCustomer: (customerId: string) => api<{ vehicles: VehicleView[]; rules: VehicleRules; tooFewPhotosMessage: string }>('GET', `/customers/${customerId}/vehicles`),
  create: (customerId: string, b: VehicleCreate) => apiFull<VehicleView>('POST', `/customers/${customerId}/vehicles`, b, { label: 'Save vehicle' }),
  addFile: (id: string, b: { kind: 'RC' | 'PHOTO'; slot?: string; fileId: string }) => apiFull<VehicleView>('POST', `/vehicles/${id}/files`, b, { label: b.kind === 'RC' ? 'New RC version' : `New ${b.slot} photo` }),
  setStatus: (id: string, version: number, status: 'ACTIVE' | 'INACTIVE') => apiFull<VehicleView>('POST', `/vehicles/${id}/status`, { version, status }, { label: status === 'INACTIVE' ? 'Mark as sold' : 'Mark active again' }),
};