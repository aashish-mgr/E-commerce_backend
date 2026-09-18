import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from "sequelize-typescript";
import User from "./userModel";

@Table({
  tableName: "refresh_tokens",
  modelName: "RefreshToken",
  timestamps: true,
})
class RefreshToken extends Model {
  @Column({
    primaryKey: true,
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    allowNull: false,
  })
  declare id: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    unique: true,
  })
  declare tokenHash: string;

  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  declare familyId: string;

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  declare userId: string;

  @BelongsTo(() => User)
  declare user: User;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  declare expiresAt: Date;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  declare revoked: boolean;
}

export default RefreshToken;