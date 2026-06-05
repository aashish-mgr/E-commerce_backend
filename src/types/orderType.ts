export interface OrderType {
    phoneNumber: string,
    shippingAddress: string,
    totalAmount: number,
    paymentDetails: {
        paymentMethod: PaymentMethod,
        paymentStatus ?: PaymentStatus
    },
    items: OrderDetails[]
}

export interface OrderDetails {
    quantity: string,
    productId: string
}

export enum PaymentMethod {
    COD = "cash on delivery",
    Khalti = "khalti",
    Esewa = "esewa"

}

export enum PaymentStatus {
    Paid = "paid",
    Unpaid = "unpaid"
}

export interface khaltiResponse {
    pidx: string,
    payment_url: string,
    expires_at: Date | string,
    expires_in: number

}

export interface TransactionVerificationResponse {
    pidx: string,
   total_amount: number,
   status: TransactionStatus,
   transaction_id: string,
   fee: number,
   refunded: boolean
}

export enum TransactionStatus {
    Completed = 'Completed',
    Pending = 'Pending',
    Initiated = 'Initiated',
    Refunded = 'Refunded',
    Expired = 'Expired',
    Canceled = 'User canceled'
}

export enum OrderStatus {
    Pending= 'pending',
    Shipped = 'shipped',
    Deliverd = 'delivered',
    Cancelled = 'cancelled'
}