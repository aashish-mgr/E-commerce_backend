import { IntegerDataType } from 'sequelize';
import {Table,Column, Model,DataType, PrimaryKey} from 'sequelize-typescript'

@Table({
    tableName: 'carts',
    modelName: 'Cart',
    timestamps: true
})

class Cart extends Model {
    @Column({
        type: DataType.UUID,
        defaultValue: DataType.UUIDV4,
        primaryKey: true
    })

    declare id: string;

    @Column({
        type: DataType.INTEGER,
        allowNull: false
    })

    declare quantity: IntegerDataType
}

export default Cart;

