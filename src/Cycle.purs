module Control.Cycle
  ( run
  , runRecord
  , Dispose
  , class CycleRunRecord
  , class CycleRunRowList
  ) where

import Prelude

import Control.Monad.Eff (Eff)
import Control.XStream (Stream)
import Data.Function.Uncurried (Fn2, runFn2)
import Type.Row (class ListToRow, class RowToList, Cons, Nil, kind RowList)

type Dispose e = Unit -> Eff e Unit

-- | Cycle run for one source input and one sink output.
run :: forall e a b.
  (a -> Stream b) ->
  (Stream b -> Eff e a) ->
  Eff e (Dispose e)
run = runFn2 _run

-- | Cycle run for a record of source inputs to sink outputs.
runRecord :: forall sources sinks drivers e
   . CycleRunRecord sources sinks drivers
  => (Record sources -> Record sinks)
  -> Record drivers
  -> Eff e (Dispose e)
runRecord = runFn2 _runRecord

foreign import _runRecord :: forall main drivers e. Fn2
  main
  drivers
  (Eff e (Dispose e))

class CycleRunRecord (sourceRow :: # Type) (sinkRow :: # Type) (driverRow :: # Type)
  | sourceRow -> sinkRow driverRow
  , sinkRow -> sourceRow driverRow
  , driverRow -> sourceRow sinkRow

instance cycleRunRecord ::
  ( RowToList sourceRow sourceList
  , RowToList sinkRow sinkList
  , RowToList driverRow driverList
  , CycleRunRowList sourceList sinkList driverList
  , ListToRow sourceList sourceRow
  , ListToRow sinkList sinkRow
  , ListToRow driverList driverRow
  ) => CycleRunRecord sourceRow sinkRow driverRow

class CycleRunRowList (sourceList :: RowList) (sinkList :: RowList) (driverList :: RowList)
  | sourceList -> sinkList driverList
  , sinkList -> sourceList driverList
  , driverList -> sourceList sinkList

instance cycleRunRowListCons ::
  ( CycleRunRowList sourceTail sinkTail driverTail
  ) => CycleRunRowList
    (Cons k b sourceTail)
    (Cons k (Stream a) sinkTail)
    (Cons k ((Stream a) -> Eff e b) driverTail)

instance cycleRunRowListNil :: CycleRunRowList Nil Nil Nil

foreign import _run :: forall e a b. Fn2
  (a -> Stream b)
  (Stream b -> Eff e a)
  (Eff e (Dispose e))
