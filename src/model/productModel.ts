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
        type: DataType.DECIMAL(10, 2),
        allowNull: false
    })
    declare productPrice: string;

    @Column({
        type: DataType.STRING
    })
    declare image: string

    @Column({
        type: DataType.INTEGER,
        allowNull: false,
        defaultValue: 0
    })
    declare stock: number

    @Column({
        type: DataType.UUID,
        allowNull: false
    })
    declare userId: string

    @Column({
        type: DataType.UUID,
        allowNull: false
    })
    declare categoryId: string

}

export default Product;
