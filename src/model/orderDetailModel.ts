
import { Table, Column, Model,DataType } from "sequelize-typescript";

@Table({
    tableName: "orderdetails",
    modelName: "OrderDetail"
})

class OrderDetail extends Model {
    @Column({
        type: DataType.UUID,
        defaultValue: DataType.UUIDV4,
        allowNull: false,
        primaryKey: true
    })

    declare id: string

    @Column({
        type: DataType.INTEGER,
        allowNull: false
    })

    declare  quantity: number

  
}

export default OrderDetail;