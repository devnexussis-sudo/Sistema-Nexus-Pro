
import { OrderStatus } from './mock-data';

export type ServiceOrderStatus = OrderStatus;

export interface ServiceOrder {
    id: string;
    customer: string;
    address: string;
    status: OrderStatus;
    date: string; // Format: DD/MM/YYYY
    description: string;
    // New fields for details
    problemReason?: string;
    contactName?: string;
    contactPhone?: string;
    latitude?: number;
    longitude?: number;
}
