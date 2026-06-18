import mongoose, { Document } from 'mongoose';
import { HotStock as IHotStock } from '../types';
export interface HotStockDocument extends Omit<IHotStock, '_id'>, Document {
}
export declare const HotStock: mongoose.Model<HotStockDocument, {}, {}, {}, mongoose.Document<unknown, {}, HotStockDocument, {}, {}> & HotStockDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
