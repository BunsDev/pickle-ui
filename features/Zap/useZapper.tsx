import { BigNumber, ethers } from "ethers";
import { Connection } from "../../containers/Connection";
import { ETH_ADDRESS } from "./constants";

const { parseUnits } = ethers.utils;
const { Zero, MaxUint256 } = ethers.constants;

interface ZapperData {
  poolAddress: string;
  sellTokenAddress: string;
  rawAmount: string;
  slippagePercentage: string;
}

const ZAPPER_API = "https://api.zapper.fi/v1";
const ZAPPER_APIKEY = "96e0cc51-a62e-42ca-acee-910ea7d2a241";

const isEth = (address: string) => address === ETH_ADDRESS;

const encodeParams = (params) =>
  Object.entries(params)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${key}[]=${value.join(",")}`;
      }

      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    })
    .join("&");

const getZapperApi = (endpoint, params) =>
  `${ZAPPER_API}${endpoint}?api_key=${ZAPPER_APIKEY}${
    params ? `&${encodeParams(params)}` : ""
  }`;

const fetchRes = async (url: string) => await fetch(url).then((x) => x.json());

export const useZapIn = ({
  poolAddress,
  sellTokenAddress,
  rawAmount,
  slippagePercentage,
}: ZapperData) => {
  const { address, signer } = Connection.useContainer();
  const isSellTokenEth = isEth(sellTokenAddress);
  const sellAmount = parseUnits(rawAmount, 18).toString();

  const zapIn = async () => {
    try {
      const gasPrices = await fetchRes(
        getZapperApi("/gas-price", {
          sellTokenAddress,
          address,
        }),
      );

      const gasPrice = BigNumber.from(gasPrices.fast.toFixed(0))
        .mul(10 ** 9)
        .toString();

      if (!isSellTokenEth) {
        const approvalState = await fetchRes(
          getZapperApi("/zap-in/pickle/approval-state", {
            sellTokenAddress,
            ownerAddress: address,
          }),
        );
        if (!approvalState.isApproved) {
          const { from, to, data } = await fetchRes(
            getZapperApi("/zap-in/pickle/approval-transaction", {
              gasPrice,
              sellTokenAddress,
              ownerAddress: address,
            }),
          );
          const approveTx = await signer.sendTransaction({ from, to, data });
          await approveTx.wait();
        }
      }
      const { from, to, data, value } = await fetchRes(
        getZapperApi("/zap-in/pickle/transaction", {
          slippagePercentage,
          gasPrice,
          poolAddress,
          sellTokenAddress,
          sellAmount,
          ownerAddress: address,
        }),
      );
      const zapTx = await signer.sendTransaction({ from, to, data, value });
      await zapTx.wait();
    } catch (error) {
      console.log("Zap Failed", error);
    }
  };
  return { zapIn };
};

export const getStats = async (jarNames : string[]) => {
  const jars = await fetchRes(`${ZAPPER_API}/vault-stats/pickle?api_key=${ZAPPER_APIKEY}`)
  const statsRes = jars.filter(jar => jarNames.includes(jar.value)) 
  return statsRes
}
