import { EnumDataType } from "sequelize";
import { Table,Column,Model,DataType,CreatedAt, PrimaryKey, AllowNull } from "sequelize-typescript";

@Table({
    tableName:"users",
    modelName:"User",
    timestamps:true
})

class User extends Model {
    @Column({
        primaryKey: true,
        type: DataType.UUID,
        defaultValue: DataType.UUIDV4,
        allowNull: false
    })
    declare id:string;

    @Column({
        type: DataType.STRING,
        allowNull: false
    })
    declare userName:string;

    @Column({
        type: DataType.STRING,
        allowNull: false
    })
    declare userEmail:string

    @Column({
        type: DataType.STRING,
        allowNull: false
    })
    declare userPassword:string
    @Column({
        type: DataType.ENUM("vendor","customer"),
        defaultValue: "customer",
        allowNull: false
    })
    declare userRole:string
}

export default User;