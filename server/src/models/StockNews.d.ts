import mongoose, { Document } from 'mongoose';
import { StockNews as IStockNews } from '../types';
export interface StockNewsDocument extends Omit<IStockNews, '_id'>, Document {
}
export declare const StockNews: mongoose.Model<StockNewsDocument, {}, {}, {}, mongoose.Document<unknown, {}, StockNewsDocument, {}, {}> & StockNewsDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
