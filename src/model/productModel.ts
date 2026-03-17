import {Column,Model,Table,DataType, PrimaryKey} from 'sequelize-typescript';

@Table({
    tableName: 'products',
    modelName: 'Product',
    timestamps: true
})

class Product extends Model{
    @Column({
        type: DataType.UUID,
        defaultValue: DataType.UUIDV4,
        primaryKey: true
    })
    declare id:string;

    @Column({
        type: DataType.STRING,
        allowNull: false
    })
    declare productName:string;

    @Column({
        type: DataType.STRING,
        allowNull: false
    })
    declare productDescription: string;

    @Column({
        type: DataType.STRING,
        allowNull: false
    })
    declare productPrice: string;

}

export default Product;
