import React from 'react';
import { useNavigate } from 'react-router-dom';

interface HotConcept {
	code: string;
	name: string;
	changeRatio: number;
	hotRate: number;
	order: number;
	marketId: number;
	hotTag?: string | null;
	limitUpTag?: string | null;
	rankChange: number;
	etf?: {
		productId: string;
		name: string;
		changeRatio: number;
		marketId: number;
	} | null;
	rank: number;
}

interface HotConceptTableProps {
	concepts: HotConcept[];
	showRank?: boolean;
}

/**
 * 热门概念表格组件
 */
export const HotConceptTable: React.FC<HotConceptTableProps> = ({ concepts, showRank = true }) => {
	const navigate = useNavigate();

	const formatHotRate = (value: number): string => {
		if (value >= 10000) {
			return `${(value / 10000).toFixed(2)}万`;
		}
		return value.toString();
	};

	const getPriceColor = (value: number): string => {
		if (value > 0) return 'text-rise';
		if (value < 0) return 'text-fall';
		return 'text-flat';
	};

	const handleRowClick = (conceptCode: string) => {
		navigate(`/concept/${conceptCode}`);
	};

	return (
		<div className="overflow-x-auto">
			<table className="stock-table">
				<thead>
					<tr>
						{showRank && <th className="w-12">排名</th>}
						<th>概念代码</th>
						<th>概念名称</th>
						<th className="text-right">涨跌幅</th>
						<th className="text-right">热度</th>
						<th>标签</th>
						<th>相关ETF</th>
					</tr>
				</thead>
				<tbody>
					{ concepts.map((concept) => (
						<tr
							key={ concept.code }
							onClick={ () => handleRowClick(concept.code) }
							className="cursor-pointer hover:bg-gray-50"
						>
							{showRank && (
								<td>
									<span className={ `inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${concept.rank <= 3
											? 'bg-red-500 text-white'
											: concept.rank <= 10
												? 'bg-orange-100 text-orange-600'
												: 'bg-gray-100 text-gray-600'
									}` }>
										{ concept.rank }
									</span>
								</td>
							)}
							<td className="font-mono text-gray-600">{ concept.code }</td>
							<td className="font-medium">{ concept.name }</td>
							<td className={ `text-right font-mono ${getPriceColor(concept.changeRatio)}` }>
								{ concept.changeRatio > 0 ? '+' : '' }{ concept.changeRatio.toFixed(2) }%
							</td>
							<td className="text-right text-gray-600">
								{ formatHotRate(concept.hotRate) }
							</td>
							<td>
								<div className="flex flex-col gap-1">
									{ concept.hotTag && (
										<span className="inline-block px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded">
											{ concept.hotTag }
										</span>
									) }
									{ concept.limitUpTag && (
										<span className="inline-block px-2 py-0.5 bg-red-50 text-red-600 text-xs rounded">
											{ concept.limitUpTag }
										</span>
									) }
								</div>
							</td>
							<td>
								{ concept.etf ? (
									<div className="flex flex-col">
										<span>{ concept.etf.name }</span>
										<span className={ `text-xs font-mono ${getPriceColor(concept.etf.changeRatio)}` }>
											{ concept.etf.changeRatio > 0 ? '+' : '' }{ concept.etf.changeRatio.toFixed(2) }%
										</span>
									</div>
								) : '-' }
							</td>
						</tr>
					)) }
				</tbody>
			</table>
		</div>
	);
};