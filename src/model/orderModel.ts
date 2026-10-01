
import { Table, Column, Model,DataType, ForeignKey } from "sequelize-typescript";
import Payment from "./paymentModel";

@Table({
    tableName: "orders",
    modelName: "Order"
})

class Order extends Model {
    @Column({
        type: DataType.UUID,
        defaultValue: DataType.UUIDV4,
        allowNull: false,
        primaryKey: true
    })

    declare id: string

    @Column({
        type: DataType.STRING,
        allowNull: false
    })

    declare shippingAddress: string

    @Column({
        type: DataType.STRING,
        allowNull: false,
        validate: {
            len: {
                args: [10,10],
                msg: "Phone number must be 10 digits"
            }
        }
    })
    declare phoneNumber: string


    @Column({
        type: DataType.FLOAT,
        allowNull: false
    })
    declare totalAmount: number

@Column({
        type: DataType.ENUM("pending","shipped","delivered","cancelled"),
        allowNull: false,
        defaultValue: "pending"
    })

    declare orderStatus: string

    // Declared explicitly rather than left implicit. The Payment association
    // below supplies this foreign key at runtime, but without the declaration
    // TypeScript rejects `order.paymentId` and callers are pushed toward
    // `as any`, which is what hid it before.
    @ForeignKey(() => Payment)
    @Column({
        type: DataType.UUID
    })

    declare paymentId: string
}

export default Order;