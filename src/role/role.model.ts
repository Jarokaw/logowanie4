import { Column, DataType, Model, Table } from "sequelize-typescript";
import { RoleEnum } from "./role.enum";

@Table({ tableName: 'role' })
export class Role extends Model<Role> {
    @Column({
        type: DataType.UUID,
        allowNull:false,
        unique: true,
        primaryKey: true,
        defaultValue: DataType.UUIDV4
    })
    declare id: string;

    @Column({
        type: DataType.STRING,
        allowNull:false
    })
    declare role: RoleEnum;

    @Column({
        type: DataType.STRING,
        allowNull:false
    })
    declare idUser: string;
     
}