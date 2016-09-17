module Control.Cycle
  ( CYCLE
  , run1
  , run2
  , run3
  ) where

import Prelude
import Control.Monad.Eff (Eff)
import Data.Function.Uncurried (Fn2, runFn2)
import Data.Tuple.Nested (Tuple3, Tuple2)

foreign import data CYCLE :: !

type EffC e a = Eff (cycle :: CYCLE | e) a

run1 :: forall e a1 a2.
  (a1 -> a2) ->
  (a2 -> EffC e a1) ->
  EffC e Unit
run1 main drivers = runFn2 _run1 main drivers

run2 :: forall e a1 a2 b1 b2.
  (a1 -> b1 -> Tuple2 a2 b2) ->
  (Tuple2
    (a2 -> EffC e a1)
    (b2 -> EffC e b1)
  ) ->
  EffC e Unit
run2 main drivers = runFn2 _run2 main drivers

run3 :: forall e a1 a2 b1 b2 c1 c2.
  (a1 -> b1 -> c1 -> Tuple3 a2 b2 c2) ->
  (Tuple3
    (a2 -> EffC e a1)
    (b2 -> EffC e b1)
    (c2 -> EffC e c1)
  ) ->
  EffC e Unit
run3 main drivers = runFn2 _run3 main drivers

foreign import _run1 :: forall e a1 a2. Fn2
  (a1 -> a2)
  (a2 -> EffC e a1)
  (EffC e Unit)

foreign import _run2 :: forall e a1 a2 b1 b2. Fn2
  (a1 -> b1 -> Tuple2 a2 b2)
  (Tuple2 (a2 -> EffC e a1) (b2 -> EffC e b1))
  (EffC e Unit)

foreign import _run3 :: forall e a1 a2 b1 b2 c1 c2. Fn2
  (a1 -> b1 -> c1 -> Tuple3 a2 b2 c2)
  (Tuple3 (a2 -> EffC e a1) (b2 -> EffC e b1) (c2 -> EffC e c1))
  (EffC e Unit)
