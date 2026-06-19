
import { Table, Column, Model, DataType, ForeignKey } from "sequelize-typescript";
import Product from "./productModel";

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

    @ForeignKey(() => Product)
    @Column({
        type: DataType.UUID,
        allowNull: true
    })
    declare productId: string | null

    @Column({
        type: DataType.ENUM("pending","shipped","delivered","cancelled"),
        allowNull: false,
        defaultValue: "pending"
    })
    declare orderStatus: string
}

export default Order;