
import { Table, Column, Model,DataType } from "sequelize-typescript";

@Table({
    tableName: "payments",
    modelName: "Payment"
})

class Payment extends Model {
    @Column({
        type: DataType.UUID,
        defaultValue: DataType.UUIDV4,
        allowNull: false,
        primaryKey: true
    })

    declare id: string

    @Column({
        type: DataType.STRING,
        
    })

    declare pidx: string

    @Column({
        type: DataType.ENUM("khalti","esewa","cash on delevery"),
        allowNull: false
    })

    declare paymentType: string

@Column({
    type: DataType.ENUM("paid","unpaid"),
    allowNull: false,
    defaultValue: "unpaid" 
})
declare paymentStatus: string
}

export default Payment;