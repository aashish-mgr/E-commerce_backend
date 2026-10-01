
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


    // DECIMAL rather than FLOAT. Postgres FLOAT is a double, so a stored total
    // can come back as 23.449999999999993 and re-serialising it sends a wrong
    // amount to the payment provider. sequelize-typescript hands DECIMAL back as
    // a string, so this is declared as one and formatted where it is displayed.
    @Column({
        type: DataType.DECIMAL(12, 2),
        allowNull: false,
        get() {
            // DECIMAL comes back from postgres as a string. Coercing it to a
            // number here keeps every read site (json responses, admin revenue
            // sums, order listings) working against the same type it had when
            // this column was FLOAT.
            const value = this.getDataValue("totalAmount") as unknown;
            return value === null || value === undefined ? value : Number(value);
        },
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