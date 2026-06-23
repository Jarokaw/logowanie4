import { Column, DataType, Table, Model} from "sequelize-typescript";


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
}