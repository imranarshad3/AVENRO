// Order contract shared by the Worker API and the admin site.

export const ORDER_STATUSES = ['pending', 'shipped', 'delivered', 'cancelled'] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]

export interface OrderItem {
  id: string
  name: string
  option: string | null
  quantity: number
  /** Unit price in whole currency units, snapshotted when the order was placed. */
  price: number
  image: string
}

export interface Order {
  reference: string
  email: string
  status: OrderStatus
  subtotal: number
  shipping: number
  total: number
  /** ISO timestamp. */
  createdAt: string
  items: OrderItem[]
}
