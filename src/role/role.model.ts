import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { RoleEnum } from "./role.enum";
import { User } from "src/users/models/users.model";

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

    @ForeignKey(() => User)
    @Column({
        type: DataType.UUID,
        allowNull:false
    })
    declare idUser: string;

    @BelongsTo(() => User, 'idUser')
    declare user: User;
     
}
