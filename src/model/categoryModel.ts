
import { Table,Column,Model,DataType} from "sequelize-typescript";

@Table ({
    tableName: 'categories',
    modelName: 'Category',
    timestamps: true
})

class Category extends Model {
   @Column ({
      type: DataType.UUID,
      defaultValue: DataType.UUIDV4,
      primaryKey: true
   })
   declare id: string

   @Column ({
    type: DataType.STRING,
    allowNull: false
   })
   declare categoryName: string
}


export default Category;