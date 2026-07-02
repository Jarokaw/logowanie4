import { Column, DataType, Table, Model, HasOne, HasMany} from "sequelize-typescript";
import { Address } from "src/address/address.model";
import { Role } from "src/role/role.model";


@Table({tableName: 'users'})
export class User extends Model<User> {
    @Column({
        type: DataType.UUID,
        allowNull: false,
        unique: true,
        primaryKey: true,
        defaultValue: DataType.UUIDV4
     })
     declare id: string;

     @Column({
        type: DataType.STRING,
        allowNull: false,
     })
     declare name: string;

     @Column({
         type: DataType.STRING,
         allowNull: false
     })
     declare password: string;

     @HasOne(() => Address, 'idUser')
     declare address: Address;

     @HasMany(() => Role, 'idUser')
     declare role: Role[];
}