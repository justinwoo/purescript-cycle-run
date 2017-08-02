module Test.Main where

import Prelude
import Control.Alt ((<|>))
import Control.Alternative (empty)
import Control.Cycle (run, runRecord)
import Control.Monad.Aff (Aff, runAff, makeAff, liftEff')
import Control.Monad.Aff.AVar (AVAR)
import Control.Monad.Aff.Console (CONSOLE)
import Control.Monad.Eff (Eff)
import Control.Monad.Eff.Exception (EXCEPTION)
import Control.Monad.Eff.Ref (readRef, modifyRef, newRef, REF)
import Control.XStream (STREAM, Stream, fromArray, addListener)
import Data.Array (snoc)
import Data.Either (fromRight)
import Partial.Unsafe (unsafePartial)
import Test.Unit (suite, test)
import Test.Unit.Assert (equal)
import Test.Unit.Console (TESTOUTPUT)
import Test.Unit.Main (runTest)

arrayFromStream :: forall a e.
  Stream a
  -> Aff
    ( stream :: STREAM
    , ref :: REF
    | e
    )
    (Array a)
arrayFromStream s = makeAff \reject resolve -> do
  ref <- newRef empty
  addListener
    { next: \a -> modifyRef ref $ flip snoc a
    , error: reject
    , complete: pure $ resolve =<< readRef ref
    }
    s

expectStream :: forall a e.
  Eq a
  => Show a
  => Array a
  -> Stream a
  -> Aff
    ( ref :: REF
    , stream :: STREAM
    | e
    )
    Unit
expectStream xs a =
  equal xs =<< arrayFromStream a

liftEff'' :: forall e a.
  Eff
    ( exception :: EXCEPTION
    | e
    ) a
  -> Aff e a
liftEff'' = map (unsafePartial fromRight) <$> liftEff'

main :: forall e.
  Eff
    ( console :: CONSOLE
    , testOutput :: TESTOUTPUT
    , avar :: AVAR
    , ref :: REF
    , stream :: STREAM
    | e
    )
    Unit
main = runTest do
  suite "Cycle" do
    test "test" do
      expectStream [1] (fromArray [1])
    test "run" do
      makeAff \reject resolve ->
        void $ run
          (\sink -> (_ * 2) <$> sink <|> fromArray [1,2,3])
          (\sink -> do
            void $ runAff reject resolve $ expectStream [2,4,6,1,2,3] sink
            pure $ fromArray [1,2,3]
          )
    test "runRecord" do
      makeAff \reject resolve -> do
        let drivers =
              { a: \sink -> do
                  void $ runAff reject resolve $ expectStream [1,2,3,4,5,6] sink
                  pure $ fromArray [4,5,6]
              , b: const $ pure unit
              } :: { a :: Stream Int -> Eff _ (Stream Int), b :: Stream Unit -> Eff _ Unit }
        let main' sources =
              { a: fromArray [1,2,3] <|> sources.a
              , b: fromArray [unit]
              } :: { a :: Stream Int, b :: Stream Unit }
        void $ runRecord
          main'
          drivers
