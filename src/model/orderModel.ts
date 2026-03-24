import { UUID, UUIDV4 } from "sequelize";
import { Table, Column, Model,DataType } from "sequelize-typescript";

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
        allowNull: false
    })
    declare phoneNumber: string

    declare paymentMethod: string

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
}

export default Order;